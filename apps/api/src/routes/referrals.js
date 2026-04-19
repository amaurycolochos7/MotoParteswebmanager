import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace, requireRole } from '../middleware/workspace.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

const PUBLIC_APP_URL = () => process.env.PUBLIC_APP_URL || 'https://motopartes.cloud';

export default async function referralsRoutes(fastify) {
    // GET /api/referrals/me — stats del workspace actual como referente.
    // Devuelve: link de referido, contador total/activos, MRR referido, comisión del mes,
    // payouts pendientes/pagados, breakdown por referido (redacted, solo nombre).
    fastify.get('/me', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
        const workspaceId = request.workspaceId;

        const workspace = await unscoped(() =>
            prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    referral_slug: true,
                    is_partner: true,
                    is_flagship: true,
                },
            })
        );

        if (!workspace) {
            return reply.status(404).send({ error: 'Workspace no encontrado.' });
        }

        const referralSlug = workspace.referral_slug || workspace.slug;
        const publicUrl = `${PUBLIC_APP_URL()}/?ref=${encodeURIComponent(referralSlug)}`;

        const referrals = await unscoped(() =>
            prisma.referral.findMany({
                where: { referrer_workspace_id: workspaceId },
                orderBy: { created_at: 'desc' },
                include: {
                    referred: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            subscription_status: true,
                            created_at: true,
                            subscription: {
                                select: {
                                    status: true,
                                    plan: { select: { code: true, name: true, price_mxn_monthly: true } },
                                },
                            },
                        },
                    },
                },
            })
        );

        const now = Date.now();
        const activeReferrals = referrals.filter(
            (r) => r.status === 'active' && (!r.ends_at || r.ends_at.getTime() > now)
        );
        const payingReferrals = activeReferrals.filter(
            (r) =>
                r.referred?.subscription &&
                ['active', 'trialing'].includes(r.referred.subscription.status) &&
                r.referred.subscription.plan &&
                r.referred.subscription.plan.price_mxn_monthly > 0
        );

        const estimatedMonthlyCommissionCents = payingReferrals.reduce((acc, r) => {
            const priceMxn = r.referred.subscription.plan.price_mxn_monthly;
            const rate = Number(r.commission_rate);
            return acc + Math.round(priceMxn * 100 * rate);
        }, 0);

        const payouts = await unscoped(() =>
            prisma.referralPayout.findMany({
                where: { referrer_workspace_id: workspaceId },
                orderBy: { period: 'desc' },
                take: 24,
            })
        );

        const totalEarnedCents = payouts
            .filter((p) => p.status === 'paid')
            .reduce((acc, p) => acc + p.commission_cents, 0);
        const pendingCents = payouts
            .filter((p) => p.status === 'pending')
            .reduce((acc, p) => acc + p.commission_cents, 0);

        return reply.send({
            workspace: {
                id: workspace.id,
                name: workspace.name,
                is_partner: workspace.is_partner,
                is_flagship: workspace.is_flagship,
            },
            referral: {
                slug: referralSlug,
                public_url: publicUrl,
                commission_rate_standard: 0.200,
                commission_rate_partner: 0.300,
                effective_rate: workspace.is_partner ? 0.300 : 0.200,
                is_lifetime_partner: workspace.is_partner,
            },
            stats: {
                total_referrals: referrals.length,
                active_referrals: activeReferrals.length,
                paying_referrals: payingReferrals.length,
                estimated_monthly_commission_mxn: Math.round(estimatedMonthlyCommissionCents / 100),
                total_earned_mxn: Math.round(totalEarnedCents / 100),
                pending_mxn: Math.round(pendingCents / 100),
            },
            referrals: referrals.map((r) => ({
                id: r.id,
                referred_name: r.referred?.name || '—',
                referred_slug: r.referred?.slug || null,
                subscription_status: r.referred?.subscription?.status || 'unknown',
                plan_code: r.referred?.subscription?.plan?.code || null,
                plan_price_mxn: r.referred?.subscription?.plan?.price_mxn_monthly || 0,
                commission_rate: Number(r.commission_rate),
                is_lifetime: r.is_lifetime,
                starts_at: r.starts_at,
                ends_at: r.ends_at,
                status: r.status,
                created_at: r.created_at,
            })),
            payouts: payouts.map((p) => ({
                id: p.id,
                period: p.period,
                referred_count: p.referred_count,
                mrr_referred_mxn: Math.round(p.mrr_referred_cents / 100),
                commission_mxn: Math.round(p.commission_cents / 100),
                status: p.status,
                paid_at: p.paid_at,
                paid_via: p.paid_via,
                notes: p.notes,
            })),
        });
    });

    // POST /api/referrals/regenerate-slug — permite al owner cambiar su referral_slug
    // una sola vez si el auto-asignado no le gusta. Valida colisiones.
    fastify.post(
        '/regenerate-slug',
        { preHandler: [authenticate, resolveWorkspace, requireRole(['owner', 'admin'])] },
        async (request, reply) => {
            const { slug } = request.body || {};
            if (!slug || typeof slug !== 'string') {
                return reply.status(400).send({ error: 'Slug requerido.' });
            }
            const normalized = slug.trim().toLowerCase();
            if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(normalized)) {
                return reply.status(400).send({ error: 'Slug inválido. Usa solo letras, números y guiones (2-40 chars).' });
            }
            const clash = await unscoped(() =>
                prisma.workspace.findFirst({
                    where: { referral_slug: normalized, id: { not: request.workspaceId } },
                    select: { id: true },
                })
            );
            if (clash) {
                return reply.status(409).send({ error: 'Ese slug ya está en uso por otro taller.' });
            }
            const updated = await unscoped(() =>
                prisma.workspace.update({
                    where: { id: request.workspaceId },
                    data: { referral_slug: normalized },
                    select: { id: true, referral_slug: true },
                })
            );
            return reply.send({
                success: true,
                referral_slug: updated.referral_slug,
                public_url: `${PUBLIC_APP_URL()}/?ref=${encodeURIComponent(updated.referral_slug)}`,
            });
        }
    );
}
