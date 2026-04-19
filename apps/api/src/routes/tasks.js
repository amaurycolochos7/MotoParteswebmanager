import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

export default async function tasksRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/tasks?status=pending|completed — defaults to pending.
    fastify.get('/', async (request) => {
        const { status = 'pending', mine } = request.query || {};
        const where = { workspace_id: request.workspace.id };
        if (status === 'pending') where.completed_at = null;
        if (status === 'completed') where.completed_at = { not: null };
        if (mine === '1') where.assigned_to = request.user.id;
        return unscoped(() =>
            prisma.task.findMany({
                where,
                orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
                take: 200,
            })
        );
    });

    fastify.post('/', async (request, reply) => {
        const body = request.body || {};
        if (!body.title) return reply.status(400).send({ error: 'title es requerido' });
        return unscoped(() =>
            prisma.task.create({
                data: {
                    workspace_id: request.workspace.id,
                    title: body.title,
                    description: body.description || null,
                    assigned_to: body.assigned_to || null,
                    due_at: body.due_at ? new Date(body.due_at) : null,
                    source: 'manual',
                    metadata: body.metadata || {},
                },
            })
        );
    });

    fastify.put('/:id/complete', async (request) => {
        const { id } = request.params;
        return unscoped(() =>
            prisma.task.update({
                where: { id },
                data: { completed_at: new Date() },
            })
        );
    });

    fastify.put('/:id/reopen', async (request) => {
        const { id } = request.params;
        return unscoped(() =>
            prisma.task.update({
                where: { id },
                data: { completed_at: null },
            })
        );
    });

    fastify.delete('/:id', async (request) => {
        const { id } = request.params;
        await unscoped(() => prisma.task.delete({ where: { id } }));
        return { success: true };
    });
}
