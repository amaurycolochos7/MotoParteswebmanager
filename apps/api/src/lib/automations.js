import prisma, { workspaceContext } from './prisma.js';
import { incrementUsageAsync } from './billing.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

// ────────────────────────────────────────────────────────────────────────
// Template substitution. Placeholders like {cliente}, {folio}, {total}…
// ────────────────────────────────────────────────────────────────────────

function substitute(body, vars) {
    if (!body) return '';
    return body.replace(/\{([a-z_]+)\}/gi, (match, key) => {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
            return String(vars[key] ?? '');
        }
        return match;
    });
}

// Build the variable bag for a given context (order-based, appointment-based…)
async function buildVars(workspaceId, context) {
    const vars = {};

    // Workspace branding → available as {taller}, {slogan}, {google_reviews}
    const ws = await unscoped(() =>
        prisma.workspace.findUnique({ where: { id: workspaceId } })
    );
    if (ws) {
        vars.taller = ws.name;
        vars.slogan = ws.branding?.tagline || '';
        vars.google_reviews = ws.settings?.google_reviews_url || '';
    }

    // Order vars
    if (context.order_id) {
        const order = await unscoped(() =>
            prisma.order.findUnique({
                where: { id: context.order_id },
                include: { client: true, motorcycle: true, status: true, mechanic: true },
            })
        );
        if (order) {
            vars.folio = order.order_number;
            vars.estado = order.status?.name || '';
            vars.total = '$' + Number(order.total_amount || 0).toLocaleString('es-MX');
            vars.anticipo = '$' + Number(order.advance_payment || 0).toLocaleString('es-MX');
            vars.diagnostico = order.initial_diagnosis || '';
            vars.notas = order.mechanic_notes || '';
            if (order.client) {
                vars.cliente = order.client.full_name || '';
                vars.cliente_telefono = order.client.phone || '';
            }
            if (order.motorcycle) {
                vars.marca = order.motorcycle.brand || '';
                vars.modelo = order.motorcycle.model || '';
                vars.placas = order.motorcycle.plates || '';
                vars.year = order.motorcycle.year || '';
            }
            if (order.mechanic) {
                vars.mecanico = order.mechanic.full_name || '';
            }
            vars.portal_link = order.public_token ? `https://motopartes.cloud/orden/${order.public_token}` : '';
        }
    }

    // Appointment vars
    if (context.appointment_id) {
        const app = await unscoped(() =>
            prisma.appointment.findUnique({
                where: { id: context.appointment_id },
                include: { client: true, motorcycle: true, mechanic: true },
            })
        );
        if (app) {
            vars.fecha = app.scheduled_date?.toLocaleDateString('es-MX') || '';
            vars.hora = app.scheduled_date?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) || '';
            vars.servicio = app.service_type || '';
            if (app.client) {
                vars.cliente = app.client.full_name || '';
                vars.cliente_telefono = app.client.phone || '';
            }
            if (app.motorcycle) {
                vars.marca = app.motorcycle.brand || '';
                vars.modelo = app.motorcycle.model || '';
            }
        }
    }

    // Client vars (for client.created / anniversary)
    if (context.client_id && !vars.cliente) {
        const c = await unscoped(() => prisma.client.findUnique({ where: { id: context.client_id } }));
        if (c) {
            vars.cliente = c.full_name || '';
            vars.cliente_telefono = c.phone || '';
        }
    }

    return vars;
}

// ────────────────────────────────────────────────────────────────────────
// Actions — each returns { success, messageId?, error? } sync/async.
// ────────────────────────────────────────────────────────────────────────

async function resolveRecipient(to, context, vars) {
    // `to` is one of: 'client' | 'mechanic' | 'admin' | a literal phone string.
    if (!to || to === 'client') return vars.cliente_telefono || null;
    if (to === 'mechanic') {
        if (context.order_id) {
            const o = await unscoped(() => prisma.order.findUnique({ where: { id: context.order_id }, include: { mechanic: true } }));
            return o?.mechanic?.phone || null;
        }
        if (context.appointment_id) {
            const a = await unscoped(() => prisma.appointment.findUnique({ where: { id: context.appointment_id }, include: { mechanic: true } }));
            return a?.mechanic?.phone || null;
        }
        return null;
    }
    if (to === 'admin') {
        // Find the workspace's owner profile.
        const wsId = context.workspace_id || context.workspaceId;
        if (!wsId) return null;
        const membership = await unscoped(() =>
            prisma.membership.findFirst({
                where: { workspace_id: wsId, role: 'owner' },
                include: { profile: true },
            })
        );
        return membership?.profile?.phone || null;
    }
    // Literal phone
    if (typeof to === 'string') return to;
    return null;
}

async function actionWhatsappSendTemplate({ automation, context, workspace_id }) {
    const params = automation.params || {};
    const templateId = params.template_id;
    if (!templateId) throw new Error('params.template_id missing');

    const template = await unscoped(() =>
        prisma.messageTemplate.findUnique({ where: { id: templateId } })
    );
    if (!template || template.workspace_id !== workspace_id) {
        throw new Error(`template ${templateId} not found in workspace`);
    }

    const vars = await buildVars(workspace_id, { ...context, workspace_id });
    const body = substitute(template.body, vars);
    const phone = await resolveRecipient(params.to || 'client', context, vars);
    if (!phone) throw new Error('no recipient phone resolvable');

    // Need a connected mechanic session to send. Pick the order's mechanic
    // if there is one, otherwise the workspace's first connected session.
    let mechanicId = null;
    if (context.order_id) {
        const o = await unscoped(() => prisma.order.findUnique({ where: { id: context.order_id } }));
        mechanicId = o?.mechanic_id || o?.approved_by || null;
    }
    if (!mechanicId) {
        const fallback = await unscoped(() =>
            prisma.whatsappSession.findFirst({
                where: { workspace_id, is_connected: true },
            })
        );
        mechanicId = fallback?.mechanic_id || null;
    }
    if (!mechanicId) throw new Error('no active WhatsApp session for this workspace');

    const res = await fetch(`${BOT_URL}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
        body: JSON.stringify({ mechanicId, phone, message: body }),
        signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`bot ${res.status}: ${text.slice(0, 200)}`);
    let data = {};
    try { data = JSON.parse(text); } catch { /* ignore */ }

    incrementUsageAsync(workspace_id, 'whatsapp_messages', 1);
    return { success: true, messageId: data.messageId || null };
}

async function actionTaskCreate({ automation, context, workspace_id }) {
    const params = automation.params || {};
    const vars = await buildVars(workspace_id, { ...context, workspace_id });

    const title = substitute(params.title || 'Tarea automática', vars);
    const description = substitute(params.description || '', vars);
    const dueAt = params.due_in_hours
        ? new Date(Date.now() + params.due_in_hours * 60 * 60 * 1000)
        : null;

    // Assigned-to: either a literal profile id in params, or 'owner' to resolve.
    let assignedTo = params.assigned_to || null;
    if (assignedTo === 'owner') {
        const m = await unscoped(() =>
            prisma.membership.findFirst({ where: { workspace_id, role: 'owner' } })
        );
        assignedTo = m?.profile_id || null;
    }

    const task = await unscoped(() =>
        prisma.task.create({
            data: {
                workspace_id,
                title,
                description: description || null,
                assigned_to: assignedTo,
                due_at: dueAt,
                source: 'automation',
                metadata: { automation_id: automation.id, context },
            },
        })
    );
    return { success: true, task_id: task.id };
}

async function actionWebhookFire({ automation, context, workspace_id }) {
    const params = automation.params || {};
    const url = params.url;
    if (!url) throw new Error('params.url missing');

    const vars = await buildVars(workspace_id, { ...context, workspace_id });
    const payload = {
        event: automation.trigger,
        workspace_id,
        context,
        vars,
        fired_at: new Date().toISOString(),
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
    return { success: true, status: res.status };
}

async function actionPdfSendQuote({ automation, context, workspace_id }) {
    if (!context.order_id) throw new Error('order_id required for pdf.send_quote');
    // Delegate to the existing /api/order-pdf internal endpoint logic by
    // importing the generator directly would require restructuring; simplest
    // is to hit the internal HTTP route.
    const INTERNAL_API = process.env.API_INTERNAL_URL || 'http://localhost:3000';
    // Need an auth token — skip for now. Implement by calling the bot
    // directly with a generated PDF here if needed. For MVP, fall back to
    // plain whatsapp template instead.
    throw new Error('pdf.send_quote: not implemented in MVP, use whatsapp.send_template instead');
}

const ACTION_HANDLERS = {
    'whatsapp.send_template': actionWhatsappSendTemplate,
    'task.create': actionTaskCreate,
    'webhook.fire': actionWebhookFire,
    'pdf.send_quote': actionPdfSendQuote,
};

// ────────────────────────────────────────────────────────────────────────
// Worker sweep — picks up pending jobs and runs them.
// ────────────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

async function processJob(job) {
    const automation = job.automation_id
        ? await unscoped(() => prisma.automation.findUnique({ where: { id: job.automation_id } }))
        : null;
    if (!automation || !automation.enabled) {
        await unscoped(() =>
            prisma.automationJob.update({
                where: { id: job.id },
                data: { status: 'done', ran_at: new Date(), result: { skipped: true, reason: 'automation_disabled_or_missing' } },
            })
        );
        return;
    }

    const handler = ACTION_HANDLERS[automation.action];
    if (!handler) {
        await unscoped(() =>
            prisma.automationJob.update({
                where: { id: job.id },
                data: { status: 'failed', ran_at: new Date(), last_error: `unknown action: ${automation.action}` },
            })
        );
        return;
    }

    try {
        const result = await handler({ automation, context: job.context, workspace_id: job.workspace_id });
        await unscoped(() =>
            prisma.$transaction([
                prisma.automationJob.update({
                    where: { id: job.id },
                    data: { status: 'done', ran_at: new Date(), result, attempts: job.attempts + 1 },
                }),
                prisma.automation.update({
                    where: { id: automation.id },
                    data: { run_count: { increment: 1 }, last_run_at: new Date(), last_error: null },
                }),
            ])
        );
    } catch (err) {
        const newAttempts = job.attempts + 1;
        const failed = newAttempts >= MAX_ATTEMPTS;
        await unscoped(() =>
            prisma.$transaction([
                prisma.automationJob.update({
                    where: { id: job.id },
                    data: {
                        status: failed ? 'failed' : 'pending',
                        attempts: newAttempts,
                        last_error: err.message.slice(0, 500),
                        // Exponential backoff: +1min, +5min, (fail).
                        scheduled_at: failed ? job.scheduled_at : new Date(Date.now() + (newAttempts === 1 ? 60_000 : 5 * 60_000)),
                        ran_at: new Date(),
                    },
                }),
                prisma.automation.update({
                    where: { id: automation.id },
                    data: { fail_count: { increment: failed ? 1 : 0 }, last_error: err.message.slice(0, 300) },
                }),
            ])
        );
    }
}

export async function runAutomationSweep() {
    const now = new Date();
    const jobs = await unscoped(() =>
        prisma.automationJob.findMany({
            where: { status: 'pending', scheduled_at: { lte: now } },
            orderBy: { scheduled_at: 'asc' },
            take: 20,
        })
    );
    if (!jobs.length) return { processed: 0 };

    // Mark as running so concurrent sweeps don't double-run.
    const ids = jobs.map((j) => j.id);
    await unscoped(() =>
        prisma.automationJob.updateMany({
            where: { id: { in: ids }, status: 'pending' },
            data: { status: 'running' },
        })
    );

    let processed = 0;
    for (const job of jobs) {
        await processJob(job);
        processed += 1;
    }
    return { processed };
}

// ────────────────────────────────────────────────────────────────────────
// Temporal sweep — creates jobs for time-based triggers every 5 minutes.
// ────────────────────────────────────────────────────────────────────────

export async function runTemporalSweep() {
    const stats = { appointment_24h: 0, appointment_2h: 0, order_idle_3d: 0, anniversary: 0 };

    // appointment.upcoming_24h — fires once per appointment, 24h-25h window.
    stats.appointment_24h = await queueAppointmentReminders('appointment.upcoming_24h', 24, 25);
    stats.appointment_2h = await queueAppointmentReminders('appointment.upcoming_2h', 2, 3);

    // order.idle_3_days — orders that are non-terminal, updated >3d ago, not
    // already alerted this week.
    stats.order_idle_3d = await queueOrderIdleAlerts();

    // client.first_visit_anniversary — first order was exactly 365±1 days ago.
    stats.anniversary = await queueClientAnniversaries();

    return stats;
}

async function queueAppointmentReminders(trigger, hoursMin, hoursMax) {
    const now = Date.now();
    const from = new Date(now + hoursMin * 60 * 60 * 1000);
    const to = new Date(now + hoursMax * 60 * 60 * 1000);

    const appts = await unscoped(() =>
        prisma.appointment.findMany({
            where: {
                scheduled_date: { gte: from, lte: to },
                status: { in: ['scheduled', 'confirmed'] },
            },
        })
    );
    let queued = 0;
    for (const app of appts) {
        if (!app.workspace_id) continue;
        // Dedup: skip if we already queued a job for this appointment + trigger today.
        const already = await unscoped(() =>
            prisma.automationJob.findFirst({
                where: {
                    workspace_id: app.workspace_id,
                    trigger_event: trigger,
                    created_at: { gte: new Date(now - 24 * 60 * 60 * 1000) },
                    context: { path: ['appointment_id'], equals: app.id },
                },
            })
        );
        if (already) continue;

        const automations = await unscoped(() =>
            prisma.automation.findMany({
                where: { workspace_id: app.workspace_id, trigger, enabled: true },
            })
        );
        for (const auto of automations) {
            await unscoped(() =>
                prisma.automationJob.create({
                    data: {
                        workspace_id: app.workspace_id,
                        automation_id: auto.id,
                        trigger_event: trigger,
                        context: { appointment_id: app.id, client_id: app.client_id, motorcycle_id: app.motorcycle_id },
                        scheduled_at: new Date(),
                    },
                })
            );
            queued += 1;
        }
    }
    return queued;
}

async function queueOrderIdleAlerts() {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const orders = await unscoped(() =>
        prisma.order.findMany({
            where: {
                updated_at: { lte: threeDaysAgo },
                status: { is_terminal: false },
            },
            take: 200,
        })
    );
    let queued = 0;
    for (const order of orders) {
        if (!order.workspace_id) continue;
        const already = await unscoped(() =>
            prisma.automationJob.findFirst({
                where: {
                    workspace_id: order.workspace_id,
                    trigger_event: 'order.idle_3_days',
                    created_at: { gte: sevenDaysAgo },
                    context: { path: ['order_id'], equals: order.id },
                },
            })
        );
        if (already) continue;

        const automations = await unscoped(() =>
            prisma.automation.findMany({
                where: { workspace_id: order.workspace_id, trigger: 'order.idle_3_days', enabled: true },
            })
        );
        for (const auto of automations) {
            await unscoped(() =>
                prisma.automationJob.create({
                    data: {
                        workspace_id: order.workspace_id,
                        automation_id: auto.id,
                        trigger_event: 'order.idle_3_days',
                        context: { order_id: order.id, client_id: order.client_id },
                        scheduled_at: new Date(),
                    },
                })
            );
            queued += 1;
        }
    }
    return queued;
}

async function queueClientAnniversaries() {
    // Find clients whose first order created_at falls in the 24-hour window
    // centered on 365 days ago.
    const now = Date.now();
    const from = new Date(now - 366 * 24 * 60 * 60 * 1000);
    const to = new Date(now - 364 * 24 * 60 * 60 * 1000);

    const rows = await unscoped(() =>
        prisma.$queryRaw`
            SELECT DISTINCT ON (client_id) client_id, workspace_id, created_at
            FROM orders
            WHERE client_id IS NOT NULL
              AND workspace_id IS NOT NULL
              AND created_at BETWEEN ${from} AND ${to}
            ORDER BY client_id, created_at ASC
        `
    );
    let queued = 0;
    for (const row of rows) {
        const workspaceId = row.workspace_id;
        const clientId = row.client_id;
        const already = await unscoped(() =>
            prisma.automationJob.findFirst({
                where: {
                    workspace_id: workspaceId,
                    trigger_event: 'client.first_visit_anniversary',
                    created_at: { gte: new Date(now - 48 * 60 * 60 * 1000) },
                    context: { path: ['client_id'], equals: clientId },
                },
            })
        );
        if (already) continue;

        const automations = await unscoped(() =>
            prisma.automation.findMany({
                where: { workspace_id: workspaceId, trigger: 'client.first_visit_anniversary', enabled: true },
            })
        );
        for (const auto of automations) {
            await unscoped(() =>
                prisma.automationJob.create({
                    data: {
                        workspace_id: workspaceId,
                        automation_id: auto.id,
                        trigger_event: 'client.first_visit_anniversary',
                        context: { client_id: clientId },
                        scheduled_at: new Date(),
                    },
                })
            );
            queued += 1;
        }
    }
    return queued;
}

// ────────────────────────────────────────────────────────────────────────
// Plan-based enforcement for toggling automations on.
// ────────────────────────────────────────────────────────────────────────

export async function canEnableAutomation(workspaceId, excludeAutomationId = null) {
    const ws = await unscoped(() =>
        prisma.workspace.findUnique({ where: { id: workspaceId }, include: { plan: true } })
    );
    if (!ws) return { allowed: false, reason: 'workspace_not_found' };
    if (ws.is_flagship) return { allowed: true };
    const limit = ws.plan?.features?.automations;
    if (limit === null || limit === undefined) return { allowed: true }; // unlimited
    if (limit === 0) return { allowed: false, reason: 'plan_forbids_automations', limit: 0 };
    const enabledCount = await unscoped(() =>
        prisma.automation.count({
            where: {
                workspace_id: workspaceId,
                enabled: true,
                id: excludeAutomationId ? { not: excludeAutomationId } : undefined,
            },
        })
    );
    if (enabledCount >= limit) return { allowed: false, reason: 'plan_limit_reached', limit, used: enabledCount };
    return { allowed: true, limit, used: enabledCount };
}
