import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace, requireRole } from '../middleware/workspace.js';
import { canEnableAutomation } from '../lib/automations.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

export default async function automationsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // List automations for the active workspace.
    fastify.get('/', async (request) => {
        return unscoped(() =>
            prisma.automation.findMany({
                where: { workspace_id: request.workspace.id },
                orderBy: [{ is_default: 'desc' }, { name: 'asc' }],
            })
        );
    });

    // Create a custom automation (owner/admin).
    fastify.post('/', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
        const body = request.body || {};
        if (!body.name || !body.trigger || !body.action) {
            return reply.status(400).send({ error: 'name, trigger y action son requeridos' });
        }
        const created = await unscoped(() =>
            prisma.automation.create({
                data: {
                    workspace_id: request.workspace.id,
                    name: String(body.name).trim(),
                    description: body.description || null,
                    trigger: body.trigger,
                    filter: body.filter || {},
                    action: body.action,
                    params: body.params || {},
                    delay_minutes: Number(body.delay_minutes) || 0,
                    enabled: false, // always off on create — user flips explicitly
                },
            })
        );
        return created;
    });

    // Toggle enabled / edit.
    fastify.put('/:id', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
        const { id } = request.params;
        const body = request.body || {};

        if (body.enabled === true) {
            const check = await canEnableAutomation(request.workspace.id, id);
            if (!check.allowed) {
                return reply.status(402).send({
                    error: check.reason === 'plan_forbids_automations'
                        ? 'Tu plan no permite automatizaciones. Actualiza a Starter o superior.'
                        : `Tu plan permite ${check.limit} automatización(es) activa(s) al mismo tiempo.`,
                    code: 'PLAN_LIMIT',
                    reason: check.reason,
                    limit: check.limit,
                    used: check.used,
                });
            }
        }

        const data = {};
        ['name', 'description', 'filter', 'params', 'delay_minutes', 'enabled'].forEach((k) => {
            if (k in body) data[k] = body[k];
        });
        const updated = await unscoped(() =>
            prisma.automation.update({
                where: { id },
                data,
            })
        );
        return updated;
    });

    // Delete.
    fastify.delete('/:id', { preHandler: requireRole('owner', 'admin') }, async (request) => {
        const { id } = request.params;
        await unscoped(() => prisma.automation.delete({ where: { id } }));
        return { success: true };
    });

    // Recent jobs log for this workspace.
    fastify.get('/jobs', async (request) => {
        const { status, limit = 50 } = request.query || {};
        return unscoped(() =>
            prisma.automationJob.findMany({
                where: {
                    workspace_id: request.workspace.id,
                    ...(status ? { status } : {}),
                },
                orderBy: { created_at: 'desc' },
                take: Math.min(200, Number(limit) || 50),
                include: { automation: { select: { id: true, name: true, trigger: true, action: true } } },
            })
        );
    });
}
