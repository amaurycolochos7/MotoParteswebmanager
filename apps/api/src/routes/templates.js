import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace, requireRole } from '../middleware/workspace.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

export default async function templatesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    fastify.get('/', async (request) => {
        return unscoped(() =>
            prisma.messageTemplate.findMany({
                where: { workspace_id: request.workspace.id },
                orderBy: [{ is_default: 'desc' }, { name: 'asc' }],
            })
        );
    });

    fastify.post('/', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
        const body = request.body || {};
        if (!body.name || !body.body || !body.channel) {
            return reply.status(400).send({ error: 'name, body, channel son requeridos' });
        }
        return unscoped(() =>
            prisma.messageTemplate.create({
                data: {
                    workspace_id: request.workspace.id,
                    name: String(body.name).trim(),
                    channel: body.channel,
                    subject: body.subject || null,
                    body: body.body,
                    is_default: false,
                },
            })
        );
    });

    fastify.put('/:id', { preHandler: requireRole('owner', 'admin') }, async (request) => {
        const { id } = request.params;
        const body = request.body || {};
        const data = {};
        ['name', 'subject', 'body', 'channel'].forEach((k) => {
            if (k in body) data[k] = body[k];
        });
        return unscoped(() => prisma.messageTemplate.update({ where: { id }, data }));
    });

    fastify.delete('/:id', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
        const { id } = request.params;
        // Prevent deleting a template that's still referenced by an automation.
        const used = await unscoped(() =>
            prisma.automation.findFirst({
                where: { workspace_id: request.workspace.id, params: { path: ['template_id'], equals: id } },
            })
        );
        if (used) {
            return reply.status(409).send({ error: `La plantilla está en uso por la automatización "${used.name}".` });
        }
        await unscoped(() => prisma.messageTemplate.delete({ where: { id } }));
        return { success: true };
    });
}
