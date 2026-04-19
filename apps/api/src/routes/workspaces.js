import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace, requireRole } from '../middleware/workspace.js';
import { nanoid } from 'nanoid';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

// Strip down workspace object for client responses — drops stripe_customer_id,
// subscription_status, etc. that the user shouldn't see unless they're the
// owner. (Owners get the full object via GET /mine?detail=full if needed.)
function publicWorkspace(ws, plan) {
    return {
        id: ws.id,
        slug: ws.slug,
        name: ws.name,
        business_type: ws.business_type,
        country: ws.country,
        timezone: ws.timezone,
        currency: ws.currency,
        folio_prefix: ws.folio_prefix,
        branding: ws.branding || {},
        settings: ws.settings || {},
        subscription_status: ws.subscription_status,
        trial_ends_at: ws.trial_ends_at,
        is_flagship: ws.is_flagship,
        onboarding_completed: ws.onboarding_completed,
        plan: plan ? {
            code: plan.code,
            name: plan.name,
            features: plan.features,
            price_mxn_monthly: plan.price_mxn_monthly,
        } : null,
    };
}

export default async function workspacesRoutes(fastify) {
    // GET /api/workspaces/plans — public, lists the catalog for the landing.
    // Note: the landing page could hit this but today it uses the static
    // frontend/lib/plans.js. The endpoint is here for the Settings / Billing
    // page to show a live list when the user is choosing a plan.
    fastify.get('/plans', async () => {
        return unscoped(() =>
            prisma.plan.findMany({
                where: { is_public: true, is_active: true },
                orderBy: { display_order: 'asc' },
            })
        );
    });

    // ─── AUTHENTICATED ROUTES ──────────────────────────────────────────
    fastify.register(async function authed(app) {
        app.addHook('preHandler', authenticate);

        // GET /api/workspaces/mine — list all workspaces the caller belongs to.
        // Used when the user has more than one membership (workspace switcher).
        app.get('/mine', async (request) => {
            const memberships = await unscoped(() =>
                prisma.membership.findMany({
                    where: { profile_id: request.user.id },
                    include: { workspace: { include: { plan: true } } },
                    orderBy: { joined_at: 'asc' },
                })
            );
            return memberships.map((m) => ({
                role: m.role,
                permissions: m.permissions,
                workspace: publicWorkspace(m.workspace, m.workspace.plan),
            }));
        });

        // ─── WORKSPACE-SCOPED ROUTES ───────────────────────────────────
        app.register(async function scoped(inst) {
            inst.addHook('preHandler', resolveWorkspace);

            // GET /api/workspaces/current — the active workspace.
            inst.get('/current', async (request) => {
                const ws = await unscoped(() =>
                    prisma.workspace.findUnique({
                        where: { id: request.workspace.id },
                        include: { plan: true, subscription: true },
                    })
                );
                const pub = publicWorkspace(ws, ws.plan);
                // Owners get extra fields (status, subscription refs)
                if (request.workspaceRole === 'owner') {
                    pub.subscription = ws.subscription;
                    pub.stripe_customer_id = ws.stripe_customer_id;
                }
                return { workspace: pub, role: request.workspaceRole };
            });

            // PUT /api/workspaces/current — owner/admin updates branding and
            // workspace-level settings.
            inst.put('/current', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
                const body = request.body || {};
                const allowed = [
                    'name', 'business_type', 'country', 'timezone', 'currency',
                    'folio_prefix', 'branding', 'settings', 'onboarding_completed',
                ];
                const data = {};
                for (const key of allowed) {
                    if (key in body) data[key] = body[key];
                }
                if (data.folio_prefix) {
                    const p = String(data.folio_prefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                    if (p.length < 2) {
                        return reply.status(400).send({ error: 'El prefijo de folio debe tener 2-4 caracteres alfanuméricos.' });
                    }
                    data.folio_prefix = p;
                }
                if (data.name) data.name = String(data.name).trim().slice(0, 120);
                if (data.branding && typeof data.branding !== 'object') {
                    return reply.status(400).send({ error: 'branding debe ser objeto.' });
                }

                const updated = await unscoped(() =>
                    prisma.workspace.update({
                        where: { id: request.workspace.id },
                        data,
                        include: { plan: true },
                    })
                );

                await unscoped(() =>
                    prisma.auditLog.create({
                        data: {
                            workspace_id: request.workspace.id,
                            profile_id: request.user.id,
                            event: 'workspace.updated',
                            payload: { keys: Object.keys(data) },
                        },
                    })
                );

                return { workspace: publicWorkspace(updated, updated.plan) };
            });

            // POST /api/workspaces/current/complete-onboarding — idempotent flip.
            inst.post('/current/complete-onboarding', { preHandler: requireRole('owner', 'admin') }, async (request) => {
                const ws = await unscoped(() =>
                    prisma.workspace.update({
                        where: { id: request.workspace.id },
                        data: { onboarding_completed: true },
                        include: { plan: true },
                    })
                );
                return { workspace: publicWorkspace(ws, ws.plan) };
            });

            // GET /api/workspaces/current/members — membership list with role.
            // Used by the Admin Users page; duplicates /api/auth/users but with
            // a more workspace-centric payload shape.
            inst.get('/current/members', async (request) => {
                const rows = await unscoped(() =>
                    prisma.membership.findMany({
                        where: { workspace_id: request.workspace.id },
                        include: { profile: true },
                        orderBy: { joined_at: 'asc' },
                    })
                );
                return rows.map((m) => {
                    const { password_hash, ...p } = m.profile;
                    return { ...p, workspace_role: m.role, workspace_permissions: m.permissions, joined_at: m.joined_at };
                });
            });

            // POST /api/workspaces/current/invitations — create an invite.
            inst.post('/current/invitations', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
                const { email, role } = request.body || {};
                if (!email) return reply.status(400).send({ error: 'email requerido' });
                const normalizedEmail = String(email).trim().toLowerCase();
                const token = nanoid(32);
                const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                const inv = await unscoped(() =>
                    prisma.invitation.create({
                        data: {
                            workspace_id: request.workspace.id,
                            email: normalizedEmail,
                            role: role || 'mechanic',
                            token,
                            expires_at: expiresAt,
                            invited_by: request.user.id,
                        },
                    })
                );
                return inv;
            });

            // GET /api/workspaces/current/invitations — list pending invites.
            inst.get('/current/invitations', { preHandler: requireRole('owner', 'admin') }, async (request) => {
                return unscoped(() =>
                    prisma.invitation.findMany({
                        where: { workspace_id: request.workspace.id, accepted_at: null },
                        orderBy: { created_at: 'desc' },
                    })
                );
            });

            // DELETE /api/workspaces/current/invitations/:id — revoke.
            inst.delete('/current/invitations/:id', { preHandler: requireRole('owner', 'admin') }, async (request) => {
                const { id } = request.params;
                await unscoped(() =>
                    prisma.invitation.deleteMany({
                        where: { id, workspace_id: request.workspace.id },
                    })
                );
                return { success: true };
            });

            // GET /api/workspaces/current/usage — per-period usage counters.
            inst.get('/current/usage', async (request) => {
                const period = new Date().toISOString().slice(0, 7); // yyyy-mm
                const counter = await unscoped(() =>
                    prisma.usageCounter.findUnique({
                        where: { workspace_id_period: { workspace_id: request.workspace.id, period } },
                    })
                );
                return { period, counter: counter || { orders_count: 0, whatsapp_messages: 0, storage_bytes: 0 } };
            });
        });
    });
}
