// Fase 7.1 — Rutas del panel super-admin.
// Todas requieren authenticate + requireSuperAdmin. Mutaciones logueadas en super_admin_actions.

import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin, logSuperAction } from '../middleware/super.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

function monthPeriod(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

export default async function superRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requireSuperAdmin);

    // ────────── MÉTRICAS ──────────
    fastify.get('/metrics', async (request, reply) => {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [
            totalWorkspaces,
            activeWorkspaces,
            trialingCount,
            pastDueCount,
            canceledLast30d,
            signupsLast7d,
            subscriptionsAggregated,
            openTickets,
            urgentTickets,
            pendingPayouts,
            orphanedOrders,
        ] = await unscoped(() => Promise.all([
            prisma.workspace.count(),
            prisma.workspace.count({ where: { is_active: true, subscription_status: { in: ['active', 'trialing'] } } }),
            prisma.workspace.count({ where: { subscription_status: 'trialing', is_active: true } }),
            prisma.workspace.count({ where: { subscription_status: 'past_due' } }),
            prisma.workspace.count({ where: { subscription_status: 'canceled', updated_at: { gte: thirtyDaysAgo } } }),
            prisma.workspace.count({ where: { created_at: { gte: sevenDaysAgo } } }),
            prisma.subscription.findMany({
                where: { status: { in: ['active', 'trialing'] } },
                include: { plan: { select: { price_mxn_monthly: true } } },
            }),
            prisma.supportTicket.count({ where: { status: { in: ['open', 'waiting_admin'] } } }),
            prisma.supportTicket.count({ where: { status: { in: ['open', 'waiting_admin'] }, priority: 'urgent' } }),
            prisma.referralPayout.aggregate({
                where: { status: 'pending' },
                _sum: { commission_cents: true },
                _count: { id: true },
            }),
            prisma.order.count(),
        ]));

        const mrrCents = subscriptionsAggregated.reduce((acc, s) => {
            const price = s.plan?.price_mxn_monthly || 0;
            return acc + price * 100;
        }, 0);
        const arrCents = mrrCents * 12;

        const trialsExpiring7d = await unscoped(() =>
            prisma.workspace.findMany({
                where: {
                    subscription_status: 'trialing',
                    trial_ends_at: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
                },
                select: { id: true, name: true, slug: true, trial_ends_at: true },
                orderBy: { trial_ends_at: 'asc' },
                take: 10,
            })
        );

        return reply.send({
            counts: {
                total_workspaces: totalWorkspaces,
                active_workspaces: activeWorkspaces,
                trialing: trialingCount,
                past_due: pastDueCount,
                canceled_last_30d: canceledLast30d,
                signups_last_7d: signupsLast7d,
                total_orders: orphanedOrders,
            },
            mrr_mxn: Math.round(mrrCents / 100),
            arr_mxn: Math.round(arrCents / 100),
            tickets: {
                open: openTickets,
                urgent: urgentTickets,
            },
            payouts: {
                pending_count: pendingPayouts._count.id || 0,
                pending_mxn: Math.round((pendingPayouts._sum.commission_cents || 0) / 100),
            },
            trials_expiring_7d: trialsExpiring7d,
            period: monthPeriod(now),
        });
    });

    // ────────── WORKSPACES ──────────
    fastify.get('/workspaces', async (request, reply) => {
        const { q, status, plan, sort = 'created_at', page = 1, per_page = 50 } = request.query || {};
        const where = {};
        if (status) where.subscription_status = status;
        if (q) {
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q, mode: 'insensitive' } },
            ];
        }
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const perPage = Math.min(200, parseInt(per_page, 10) || 50);

        const [items, total] = await unscoped(() => Promise.all([
            prisma.workspace.findMany({
                where,
                orderBy: { [sort]: sort === 'name' ? 'asc' : 'desc' },
                skip: (pageNum - 1) * perPage,
                take: perPage,
                include: {
                    plan: { select: { code: true, name: true, price_mxn_monthly: true } },
                    subscription: { select: { status: true, source: true, current_period_end: true, manual_expires_at: true } },
                    _count: { select: { memberships: true, clients: true, orders: true } },
                },
            }),
            prisma.workspace.count({ where }),
        ]));

        return reply.send({ items, total, page: pageNum, per_page: perPage });
    });

    fastify.get('/workspaces/:id', async (request, reply) => {
        const ws = await unscoped(() =>
            prisma.workspace.findUnique({
                where: { id: request.params.id },
                include: {
                    plan: true,
                    subscription: { include: { plan: true } },
                    memberships: {
                        include: { profile: { select: { id: true, email: true, full_name: true, is_active: true } } },
                    },
                    usage_counters: { orderBy: { period: 'desc' }, take: 6 },
                    _count: { select: { clients: true, orders: true, motorcycles: true, appointments: true } },
                },
            })
        );
        if (!ws) return reply.status(404).send({ error: 'Workspace no encontrado.' });

        const recentOrders = await unscoped(() =>
            prisma.order.findMany({
                where: { workspace_id: ws.id },
                orderBy: { created_at: 'desc' },
                take: 10,
                select: { id: true, order_number: true, status: true, total: true, created_at: true },
            })
        );
        const tickets = await unscoped(() =>
            prisma.supportTicket.findMany({
                where: { workspace_id: ws.id },
                orderBy: { last_message_at: 'desc' },
                take: 10,
                select: { id: true, ticket_number: true, subject: true, status: true, priority: true, last_message_at: true },
            })
        );

        return reply.send({ workspace: ws, recent_orders: recentOrders, tickets });
    });

    fastify.post('/workspaces/:id/plan', async (request, reply) => {
        const { plan_code, expires_at, note } = request.body || {};
        if (!plan_code) return reply.status(400).send({ error: 'plan_code requerido.' });

        const [workspace, plan] = await unscoped(() => Promise.all([
            prisma.workspace.findUnique({ where: { id: request.params.id }, include: { subscription: true, plan: true } }),
            prisma.plan.findUnique({ where: { code: plan_code } }),
        ]));
        if (!workspace) return reply.status(404).send({ error: 'Workspace no encontrado.' });
        if (!plan) return reply.status(400).send({ error: 'Plan no existe.' });

        const before = {
            plan_id: workspace.plan_id,
            plan_code: workspace.plan?.code || null,
            subscription_status: workspace.subscription_status,
        };

        const expiresAt = expires_at ? new Date(expires_at) : null;

        await unscoped(() =>
            prisma.$transaction([
                prisma.workspace.update({
                    where: { id: workspace.id },
                    data: {
                        plan_id: plan.id,
                        subscription_status: 'active',
                    },
                }),
                workspace.subscription
                    ? prisma.subscription.update({
                        where: { workspace_id: workspace.id },
                        data: {
                            plan_id: plan.id,
                            status: 'active',
                            source: 'manual',
                            manual_assigned_by: request.user.id,
                            manual_expires_at: expiresAt,
                            manual_note: note || null,
                            current_period_end: expiresAt,
                        },
                    })
                    : prisma.subscription.create({
                        data: {
                            workspace_id: workspace.id,
                            plan_id: plan.id,
                            status: 'active',
                            source: 'manual',
                            manual_assigned_by: request.user.id,
                            manual_expires_at: expiresAt,
                            manual_note: note || null,
                            current_period_end: expiresAt,
                        },
                    }),
            ])
        );

        await logSuperAction({
            request,
            action: 'workspace.plan_assigned_manual',
            target_type: 'workspace',
            target_id: workspace.id,
            payload_before: before,
            payload_after: { plan_code: plan.code, expires_at: expiresAt?.toISOString(), note },
            reason: note,
        });

        return reply.send({ success: true });
    });

    fastify.post('/workspaces/:id/extend-trial', async (request, reply) => {
        const { days, reason } = request.body || {};
        const n = parseInt(days, 10);
        if (!n || n <= 0 || n > 365) return reply.status(400).send({ error: 'days debe ser 1..365' });

        const ws = await unscoped(() => prisma.workspace.findUnique({ where: { id: request.params.id } }));
        if (!ws) return reply.status(404).send({ error: 'Workspace no encontrado.' });

        const currentEnd = ws.trial_ends_at && ws.trial_ends_at > new Date() ? ws.trial_ends_at : new Date();
        const newEnd = new Date(currentEnd.getTime() + n * 24 * 60 * 60 * 1000);

        await unscoped(() =>
            prisma.workspace.update({
                where: { id: ws.id },
                data: { trial_ends_at: newEnd, subscription_status: 'trialing' },
            })
        );

        await logSuperAction({
            request,
            action: 'workspace.trial_extended',
            target_type: 'workspace',
            target_id: ws.id,
            payload_before: { trial_ends_at: ws.trial_ends_at },
            payload_after: { trial_ends_at: newEnd, days_added: n },
            reason,
        });

        return reply.send({ success: true, trial_ends_at: newEnd });
    });

    fastify.post('/workspaces/:id/suspend', async (request, reply) => {
        const { reason } = request.body || {};
        if (!reason) return reply.status(400).send({ error: 'Razón requerida.' });

        const ws = await unscoped(() => prisma.workspace.findUnique({ where: { id: request.params.id } }));
        if (!ws) return reply.status(404).send({ error: 'Workspace no encontrado.' });
        if (ws.is_flagship) return reply.status(400).send({ error: 'No se puede suspender un workspace flagship.' });

        await unscoped(() =>
            prisma.workspace.update({
                where: { id: ws.id },
                data: {
                    is_active: false,
                    suspended_at: new Date(),
                    suspended_reason: reason,
                    suspended_by: request.user.id,
                },
            })
        );
        await logSuperAction({
            request, action: 'workspace.suspended', target_type: 'workspace', target_id: ws.id,
            payload_after: { reason }, reason,
        });
        return reply.send({ success: true });
    });

    fastify.post('/workspaces/:id/unsuspend', async (request, reply) => {
        const ws = await unscoped(() => prisma.workspace.findUnique({ where: { id: request.params.id } }));
        if (!ws) return reply.status(404).send({ error: 'Workspace no encontrado.' });

        await unscoped(() =>
            prisma.workspace.update({
                where: { id: ws.id },
                data: { is_active: true, suspended_at: null, suspended_reason: null, suspended_by: null },
            })
        );
        await logSuperAction({
            request, action: 'workspace.unsuspended', target_type: 'workspace', target_id: ws.id,
        });
        return reply.send({ success: true });
    });

    fastify.post('/workspaces/:id/partner-toggle', async (request, reply) => {
        const ws = await unscoped(() => prisma.workspace.findUnique({ where: { id: request.params.id } }));
        if (!ws) return reply.status(404).send({ error: 'Workspace no encontrado.' });

        const newVal = !ws.is_partner;
        await unscoped(() =>
            prisma.workspace.update({ where: { id: ws.id }, data: { is_partner: newVal } })
        );
        await logSuperAction({
            request, action: newVal ? 'workspace.partner_enabled' : 'workspace.partner_disabled',
            target_type: 'workspace', target_id: ws.id,
            payload_before: { is_partner: ws.is_partner }, payload_after: { is_partner: newVal },
        });
        return reply.send({ success: true, is_partner: newVal });
    });

    // ────────── USERS ──────────
    fastify.get('/users', async (request, reply) => {
        const { q, super: superFilter, active } = request.query || {};
        const where = {};
        if (q) {
            where.OR = [
                { email: { contains: q, mode: 'insensitive' } },
                { full_name: { contains: q, mode: 'insensitive' } },
            ];
        }
        if (superFilter === 'true') where.is_super_admin = true;
        if (active === 'true') where.is_active = true;
        if (active === 'false') where.is_active = false;

        const users = await unscoped(() =>
            prisma.profile.findMany({
                where,
                select: {
                    id: true, email: true, full_name: true, role: true, is_active: true,
                    is_super_admin: true, created_at: true, phone: true,
                    memberships: {
                        select: { workspace: { select: { id: true, name: true, slug: true } }, role: true },
                    },
                },
                orderBy: { created_at: 'desc' },
                take: 200,
            })
        );
        return reply.send({ items: users });
    });

    fastify.post('/users/:id/deactivate', async (request, reply) => {
        const profile = await unscoped(() => prisma.profile.findUnique({ where: { id: request.params.id } }));
        if (!profile) return reply.status(404).send({ error: 'Profile no encontrado.' });
        if (profile.is_super_admin) return reply.status(400).send({ error: 'No se puede desactivar otro super-admin desde aquí.' });

        await unscoped(() =>
            prisma.profile.update({ where: { id: profile.id }, data: { is_active: false } })
        );
        await logSuperAction({
            request, action: 'user.deactivated', target_type: 'profile', target_id: profile.id,
        });
        return reply.send({ success: true });
    });

    fastify.post('/users/:id/reactivate', async (request, reply) => {
        await unscoped(() =>
            prisma.profile.update({ where: { id: request.params.id }, data: { is_active: true } })
        );
        await logSuperAction({
            request, action: 'user.reactivated', target_type: 'profile', target_id: request.params.id,
        });
        return reply.send({ success: true });
    });

    // ────────── AUDIT ──────────
    fastify.get('/audit', async (request, reply) => {
        const { target_type, action, from, to, workspace_id, limit = 100 } = request.query || {};
        const where = {};
        if (target_type) where.target_type = target_type;
        if (action) where.action = action;
        if (from) where.created_at = { ...(where.created_at || {}), gte: new Date(from) };
        if (to) where.created_at = { ...(where.created_at || {}), lte: new Date(to) };

        const superActions = await unscoped(() =>
            prisma.superAdminAction.findMany({
                where,
                include: { super_admin: { select: { email: true, full_name: true } } },
                orderBy: { created_at: 'desc' },
                take: Math.min(500, parseInt(limit, 10) || 100),
            })
        );

        // Combinar con audit_logs generales del workspace si workspace_id
        let workspaceAudit = [];
        if (workspace_id) {
            workspaceAudit = await unscoped(() =>
                prisma.auditLog.findMany({
                    where: { workspace_id },
                    orderBy: { created_at: 'desc' },
                    take: 100,
                })
            );
        }

        return reply.send({ super_actions: superActions, workspace_audit: workspaceAudit });
    });

    // ────────── BILLING OVERVIEW ──────────
    fastify.get('/subscriptions', async (request, reply) => {
        const { status, source } = request.query || {};
        const where = {};
        if (status) where.status = status;
        if (source) where.source = source;

        const subs = await unscoped(() =>
            prisma.subscription.findMany({
                where,
                include: {
                    workspace: { select: { id: true, name: true, slug: true, is_flagship: true, is_partner: true } },
                    plan: { select: { code: true, name: true, price_mxn_monthly: true } },
                },
                orderBy: { updated_at: 'desc' },
                take: 500,
            })
        );
        return reply.send({ items: subs });
    });

    fastify.get('/payouts', async (request, reply) => {
        const { status } = request.query || {};
        const where = {};
        if (status) where.status = status;

        const payouts = await unscoped(() =>
            prisma.referralPayout.findMany({
                where,
                include: {
                    referrer: { select: { id: true, name: true, slug: true, is_partner: true } },
                },
                orderBy: [{ status: 'asc' }, { period: 'desc' }],
                take: 500,
            })
        );
        return reply.send({ items: payouts });
    });

    fastify.post('/payouts/:id/pay', async (request, reply) => {
        const { paid_via, reference, notes } = request.body || {};
        const p = await unscoped(() => prisma.referralPayout.findUnique({ where: { id: request.params.id } }));
        if (!p) return reply.status(404).send({ error: 'Payout no encontrado.' });
        if (p.status === 'paid') return reply.status(400).send({ error: 'Ya estaba marcado como pagado.' });

        await unscoped(() =>
            prisma.referralPayout.update({
                where: { id: p.id },
                data: {
                    status: 'paid',
                    paid_at: new Date(),
                    paid_via: paid_via || 'spei',
                    notes: [notes, reference && `ref: ${reference}`].filter(Boolean).join(' | ') || null,
                },
            })
        );
        await logSuperAction({
            request, action: 'payout.marked_paid', target_type: 'referral_payout', target_id: p.id,
            payload_before: { status: p.status }, payload_after: { status: 'paid', paid_via, reference },
        });
        return reply.send({ success: true });
    });

    fastify.post('/payouts/:id/skip', async (request, reply) => {
        const { reason } = request.body || {};
        const p = await unscoped(() => prisma.referralPayout.findUnique({ where: { id: request.params.id } }));
        if (!p) return reply.status(404).send({ error: 'Payout no encontrado.' });

        await unscoped(() =>
            prisma.referralPayout.update({
                where: { id: p.id },
                data: { status: 'skipped', notes: reason || p.notes },
            })
        );
        await logSuperAction({
            request, action: 'payout.skipped', target_type: 'referral_payout', target_id: p.id, reason,
        });
        return reply.send({ success: true });
    });

    // ────────── TICKETS (super-admin) ──────────
    fastify.get('/tickets', async (request, reply) => {
        const { status, assigned, priority, q, limit = 100 } = request.query || {};
        const where = {};
        if (status) where.status = status;
        if (priority) where.priority = priority;
        if (assigned === 'me') where.assigned_to = request.user.id;
        if (assigned === 'unassigned') where.assigned_to = null;
        if (q) {
            where.OR = [
                { subject: { contains: q, mode: 'insensitive' } },
            ];
        }

        const items = await unscoped(() =>
            prisma.supportTicket.findMany({
                where,
                orderBy: [
                    { priority: 'desc' }, // urgent primero
                    { last_message_at: 'desc' },
                ],
                take: Math.min(500, parseInt(limit, 10) || 100),
                include: {
                    workspace: { select: { id: true, name: true, slug: true, is_flagship: true, is_partner: true } },
                    creator: { select: { full_name: true, email: true } },
                    assignee: { select: { id: true, full_name: true, email: true } },
                },
            })
        );
        return reply.send({ items });
    });

    fastify.get('/tickets/:id', async (request, reply) => {
        const ticket = await unscoped(() =>
            prisma.supportTicket.findUnique({
                where: { id: request.params.id },
                include: {
                    workspace: true,
                    creator: { select: { id: true, full_name: true, email: true, phone: true } },
                    assignee: { select: { id: true, full_name: true, email: true } },
                    messages: {
                        orderBy: { created_at: 'asc' },
                        include: {
                            author: { select: { id: true, full_name: true, email: true, is_super_admin: true } },
                            attachments: true,
                        },
                    },
                    attachments: { where: { message_id: null } },
                },
            })
        );
        if (!ticket) return reply.status(404).send({ error: 'Ticket no encontrado.' });

        // Reset admin_unread.
        if (ticket.admin_unread > 0) {
            await unscoped(() =>
                prisma.supportTicket.update({
                    where: { id: ticket.id },
                    data: { admin_unread: 0 },
                })
            );
        }
        return reply.send({ ticket });
    });

    fastify.post('/tickets/:id/reply', async (request, reply) => {
        const { body_md, is_internal = false } = request.body || {};
        if (!body_md?.trim()) return reply.status(400).send({ error: 'Mensaje requerido.' });

        const ticket = await unscoped(() =>
            prisma.supportTicket.findUnique({ where: { id: request.params.id } })
        );
        if (!ticket) return reply.status(404).send({ error: 'Ticket no encontrado.' });

        const result = await unscoped(() =>
            prisma.$transaction(async (tx) => {
                const msg = await tx.ticketMessage.create({
                    data: {
                        ticket_id: ticket.id,
                        author_id: request.user.id,
                        author_type: is_internal ? 'admin' : 'admin',
                        body_md: body_md.trim().slice(0, 20000),
                        is_internal,
                    },
                });
                const updates = {};
                if (!is_internal) {
                    updates.last_message_at = new Date();
                    updates.last_message_from = 'admin';
                    updates.status = 'waiting_customer';
                    updates.customer_unread = { increment: 1 };
                    updates.admin_unread = 0;
                    if (!ticket.first_response_at) updates.first_response_at = new Date();
                    if (!ticket.assigned_to) updates.assigned_to = request.user.id;
                }
                await tx.supportTicket.update({ where: { id: ticket.id }, data: updates });
                return msg;
            })
        );

        if (!is_internal) {
            const { notifyTicketReply } = await import('../lib/ticket-notifications.js');
            notifyTicketReply({ ticket_id: ticket.id, from: 'admin' }).catch(() => {});
        }
        await logSuperAction({
            request, action: is_internal ? 'ticket.internal_note' : 'ticket.reply',
            target_type: 'ticket', target_id: ticket.id,
        });
        return reply.send({ message: result });
    });

    fastify.patch('/tickets/:id', async (request, reply) => {
        const { status, priority, assigned_to, tags } = request.body || {};
        const data = {};
        if (status) data.status = status;
        if (priority) data.priority = priority;
        if (assigned_to !== undefined) data.assigned_to = assigned_to;
        if (tags) data.tags = tags;
        if (status === 'resolved' && !data.resolved_at) data.resolved_at = new Date();

        const before = await unscoped(() =>
            prisma.supportTicket.findUnique({
                where: { id: request.params.id },
                select: { status: true, priority: true, assigned_to: true, tags: true },
            })
        );
        if (!before) return reply.status(404).send({ error: 'Ticket no encontrado.' });

        await unscoped(() =>
            prisma.supportTicket.update({ where: { id: request.params.id }, data })
        );
        await logSuperAction({
            request, action: 'ticket.patched', target_type: 'ticket', target_id: request.params.id,
            payload_before: before, payload_after: data,
        });
        return reply.send({ success: true });
    });

    // ────────── CANNED RESPONSES ──────────
    fastify.get('/canned', async (request, reply) => {
        const items = await unscoped(() =>
            prisma.cannedResponse.findMany({ orderBy: { shortcut: 'asc' } })
        );
        return reply.send({ items });
    });

    fastify.post('/canned', async (request, reply) => {
        const { shortcut, title, body_md, category } = request.body || {};
        if (!shortcut || !title || !body_md) return reply.status(400).send({ error: 'shortcut, title, body_md requeridos' });
        const norm = String(shortcut).trim().toLowerCase().replace(/\s+/g, '-');
        try {
            const item = await unscoped(() =>
                prisma.cannedResponse.create({
                    data: { shortcut: norm, title, body_md, category, created_by: request.user.id },
                })
            );
            await logSuperAction({
                request, action: 'canned.created', target_type: 'canned', target_id: item.id,
            });
            return reply.send({ item });
        } catch (err) {
            if (err?.code === 'P2002') return reply.status(409).send({ error: 'Shortcut ya existe.' });
            throw err;
        }
    });

    fastify.put('/canned/:id', async (request, reply) => {
        const { shortcut, title, body_md, category } = request.body || {};
        const item = await unscoped(() =>
            prisma.cannedResponse.update({
                where: { id: request.params.id },
                data: {
                    shortcut: shortcut ? String(shortcut).trim().toLowerCase() : undefined,
                    title, body_md, category,
                },
            })
        );
        await logSuperAction({
            request, action: 'canned.updated', target_type: 'canned', target_id: item.id,
        });
        return reply.send({ item });
    });

    fastify.delete('/canned/:id', async (request, reply) => {
        await unscoped(() =>
            prisma.cannedResponse.delete({ where: { id: request.params.id } })
        );
        await logSuperAction({
            request, action: 'canned.deleted', target_type: 'canned', target_id: request.params.id,
        });
        return reply.send({ success: true });
    });

    // ────────── IMPERSONATION ──────────
    fastify.post('/workspaces/:id/impersonate', async (request, reply) => {
        const { reason } = request.body || {};
        if (!reason) return reply.status(400).send({ error: 'Razón requerida.' });

        const ws = await unscoped(() =>
            prisma.workspace.findUnique({
                where: { id: request.params.id },
                include: {
                    memberships: {
                        where: { role: 'owner' },
                        include: { profile: true },
                        take: 1,
                    },
                },
            })
        );
        if (!ws) return reply.status(404).send({ error: 'Workspace no encontrado.' });
        const owner = ws.memberships[0]?.profile;
        if (!owner) return reply.status(400).send({ error: 'Workspace sin owner.' });

        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

        const session = await unscoped(() =>
            prisma.impersonationSession.create({
                data: {
                    super_admin_id: request.user.id,
                    workspace_id: ws.id,
                    profile_imp_id: owner.id,
                    reason,
                    expires_at: expiresAt,
                    ip_address: request.ip || null,
                },
            })
        );

        // JWT especial de impersonation: incluye el profile_imp_id + flag + session_id.
        const { generateToken } = await import('../middleware/auth.js');
        const token = generateToken({
            id: owner.id,
            email: owner.email,
            role: owner.role,
            memberships: [{ workspace_id: ws.id, role: 'owner' }],
            workspace_id: ws.id,
            impersonation_session_id: session.id,
            impersonating_super_id: request.user.id,
        }, { expiresIn: '1h' });

        await logSuperAction({
            request, action: 'impersonate.start', target_type: 'workspace', target_id: ws.id,
            payload_after: { session_id: session.id, impersonated_profile_id: owner.id }, reason,
        });

        return reply.send({
            token,
            workspace: { id: ws.id, name: ws.name, slug: ws.slug },
            profile: { id: owner.id, email: owner.email, full_name: owner.full_name },
            expires_at: expiresAt,
            session_id: session.id,
        });
    });

    fastify.post('/impersonate/end', async (request, reply) => {
        const { session_id } = request.body || {};
        if (!session_id) return reply.status(400).send({ error: 'session_id requerido.' });
        await unscoped(() =>
            prisma.impersonationSession.update({
                where: { id: session_id },
                data: { ended_at: new Date() },
            })
        );
        await logSuperAction({
            request, action: 'impersonate.end', target_type: 'impersonation', target_id: session_id,
        });
        return reply.send({ success: true });
    });

    // ────────── TIMESERIES (Fase 7.4) ──────────
    // Devuelve series diarias de los últimos N días. Tres métricas:
    //   - signups:   workspaces creados por día
    //   - mrr:       MRR snapshot por día (suma de subs activas con sub.created_at ≤ día)
    //   - churn:     workspaces con subscription_status='canceled' cuyo canceled_at cae en el día
    fastify.get('/metrics/timeseries', async (request, reply) => {
        const days = Math.min(365, Math.max(7, parseInt(request.query?.range || '90', 10)));
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        startDate.setUTCHours(0, 0, 0, 0);

        // Fetch todas las rows relevantes una sola vez
        const [workspaces, subs] = await unscoped(() => Promise.all([
            prisma.workspace.findMany({
                select: { id: true, created_at: true, subscription_status: true, updated_at: true, is_active: true },
            }),
            prisma.subscription.findMany({
                include: { plan: { select: { price_mxn_monthly: true } } },
                orderBy: { created_at: 'asc' },
            }),
        ]));

        const series = [];
        for (let i = 0; i <= days; i++) {
            const day = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dayStr = day.toISOString().slice(0, 10);
            const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);

            const signups = workspaces.filter(
                (w) => w.created_at >= day && w.created_at < dayEnd
            ).length;

            // MRR snapshot: subs activas cuyo created_at ≤ dayEnd y que no estén canceled al final del día.
            const mrr = subs.reduce((acc, s) => {
                if (s.created_at > dayEnd) return acc;
                if (['canceled', 'paused'].includes(s.status) && s.updated_at <= dayEnd) return acc;
                return acc + (s.plan?.price_mxn_monthly || 0);
            }, 0);

            const churn = workspaces.filter((w) =>
                w.subscription_status === 'canceled' &&
                w.updated_at >= day && w.updated_at < dayEnd
            ).length;

            series.push({ date: dayStr, signups, mrr_mxn: mrr, churn });
        }

        return reply.send({ range_days: days, series });
    });

    // ────────── EXPORTS CSV (Fase 7.4) ──────────
    function toCsv(rows) {
        if (!rows.length) return '';
        const headers = Object.keys(rows[0]);
        const esc = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v instanceof Date ? v.toISOString() : v);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return headers.join(',') + '\n' + rows.map((r) => headers.map((h) => esc(r[h])).join(',')).join('\n');
    }

    fastify.get('/exports/workspaces.csv', async (request, reply) => {
        const items = await unscoped(() =>
            prisma.workspace.findMany({
                include: { plan: true, subscription: true },
                orderBy: { created_at: 'desc' },
            })
        );
        const rows = items.map((w) => ({
            id: w.id,
            slug: w.slug,
            name: w.name,
            is_flagship: w.is_flagship,
            is_partner: w.is_partner,
            is_active: w.is_active,
            plan: w.plan?.code || '',
            subscription_status: w.subscription_status,
            source: w.subscription?.source || '',
            trial_ends_at: w.trial_ends_at,
            manual_expires_at: w.subscription?.manual_expires_at || '',
            created_at: w.created_at,
            created_by: w.created_by || '',
        }));
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="workspaces-${new Date().toISOString().slice(0, 10)}.csv"`);
        return reply.send(toCsv(rows));
    });

    fastify.get('/exports/tickets.csv', async (request, reply) => {
        const items = await unscoped(() =>
            prisma.supportTicket.findMany({
                include: {
                    workspace: { select: { name: true, slug: true } },
                    creator: { select: { email: true, full_name: true } },
                },
                orderBy: { created_at: 'desc' },
            })
        );
        const rows = items.map((t) => ({
            number: t.ticket_number,
            workspace: t.workspace?.name || '',
            workspace_slug: t.workspace?.slug || '',
            creator_email: t.creator?.email || '',
            creator_name: t.creator?.full_name || '',
            subject: t.subject,
            category: t.category,
            priority: t.priority,
            status: t.status,
            first_response_at: t.first_response_at || '',
            resolved_at: t.resolved_at || '',
            created_at: t.created_at,
        }));
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`);
        return reply.send(toCsv(rows));
    });

    fastify.get('/exports/payouts.csv', async (request, reply) => {
        const items = await unscoped(() =>
            prisma.referralPayout.findMany({
                include: { referrer: { select: { name: true, slug: true } } },
                orderBy: [{ period: 'desc' }],
            })
        );
        const rows = items.map((p) => ({
            period: p.period,
            referrer: p.referrer?.name || '',
            referrer_slug: p.referrer?.slug || '',
            referred_count: p.referred_count,
            mrr_referred_mxn: Math.round(p.mrr_referred_cents / 100),
            commission_mxn: Math.round(p.commission_cents / 100),
            status: p.status,
            paid_at: p.paid_at || '',
            paid_via: p.paid_via || '',
            notes: p.notes || '',
        }));
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="payouts-${new Date().toISOString().slice(0, 10)}.csv"`);
        return reply.send(toCsv(rows));
    });

    // ────────── MAINTENANCE ──────────
    fastify.post('/maintenance/run-payout-sweep', async (request, reply) => {
        const { runReferralPayoutSweep } = await import('../lib/referral-sweep.js');
        const result = await runReferralPayoutSweep({ force: true });
        await logSuperAction({
            request, action: 'maintenance.run_payout_sweep', target_type: 'system',
            payload_after: result,
        });
        return reply.send({ success: true, result });
    });
}
