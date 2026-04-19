// Fase 6.2 — Sweep mensual de comisiones de referidos.
// Corre todos los días al arrancar el API; si estamos en día 1 del mes y no
// hay payout creado para el período anterior, lo genera.
//
// Para cada workspace referente con Referrals active/paying:
//   1. Calcula MRR del referido (plan.price_mxn_monthly).
//   2. commission_cents = MRR * commission_rate.
//   3. Acumula en un ReferralPayout único por (referrer_workspace_id, period).
//
// Nota: la "period" es el mes que acaba de CERRAR. Ejemplo: corriendo el
// 2026-05-01 → period='2026-04'. Se genera el payout del mes pasado.

import prisma, { workspaceContext } from './prisma.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

function previousMonthPeriod(now = new Date()) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-11, current month
    // Mes anterior:
    const prev = new Date(Date.UTC(year, month - 1, 1));
    const y = prev.getUTCFullYear();
    const m = String(prev.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export async function runReferralPayoutSweep({ force = false, periodOverride = null } = {}) {
    const period = periodOverride || previousMonthPeriod();
    const now = new Date();

    if (!force && now.getUTCDate() !== 1) {
        // Solo corremos el día 1 del mes, excepto que se fuerce.
        return { skipped: true, reason: 'not-first-of-month', period };
    }

    console.log(`[referral-sweep] Generando payouts para período ${period}.`);

    // Agrupamos Referrals activos por referente.
    const referrals = await unscoped(() =>
        prisma.referral.findMany({
            where: {
                status: 'active',
                OR: [{ ends_at: null }, { ends_at: { gt: now } }],
            },
            include: {
                referred: {
                    select: {
                        id: true,
                        name: true,
                        subscription: {
                            select: {
                                status: true,
                                plan: { select: { price_mxn_monthly: true } },
                            },
                        },
                    },
                },
            },
        })
    );

    const byReferrer = new Map(); // referrer_id → { entries: [], total_mrr, total_commission }
    for (const r of referrals) {
        const sub = r.referred?.subscription;
        if (!sub || !['active', 'trialing'].includes(sub.status)) continue;
        const priceMxn = sub.plan?.price_mxn_monthly || 0;
        if (priceMxn <= 0) continue; // solo planes pagados

        const mrrCents = priceMxn * 100;
        const commissionCents = Math.round(mrrCents * Number(r.commission_rate));

        if (!byReferrer.has(r.referrer_workspace_id)) {
            byReferrer.set(r.referrer_workspace_id, { entries: [], total_mrr: 0, total_commission: 0 });
        }
        const bucket = byReferrer.get(r.referrer_workspace_id);
        bucket.entries.push({
            referred_ws_id: r.referred_workspace_id,
            referred_name: r.referred.name,
            rate: Number(r.commission_rate),
            is_lifetime: r.is_lifetime,
            mrr_cents: mrrCents,
            commission_cents: commissionCents,
        });
        bucket.total_mrr += mrrCents;
        bucket.total_commission += commissionCents;
    }

    let created = 0;
    let skipped = 0;
    for (const [referrerId, bucket] of byReferrer.entries()) {
        // Idempotente por @@unique(referrer_workspace_id, period).
        const existing = await unscoped(() =>
            prisma.referralPayout.findUnique({
                where: {
                    referrer_workspace_id_period: {
                        referrer_workspace_id: referrerId,
                        period,
                    },
                },
                select: { id: true, status: true },
            })
        );
        if (existing) {
            skipped += 1;
            continue;
        }

        await unscoped(() =>
            prisma.referralPayout.create({
                data: {
                    referrer_workspace_id: referrerId,
                    period,
                    referred_count: bucket.entries.length,
                    mrr_referred_cents: bucket.total_mrr,
                    commission_cents: bucket.total_commission,
                    status: 'pending',
                    breakdown: bucket.entries,
                },
            })
        );
        created += 1;
    }

    console.log(`[referral-sweep] Completado — período=${period} created=${created} skipped=${skipped}`);
    return { period, created, skipped, total_referrers: byReferrer.size };
}
