import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';

export default async function statusesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    fastify.get('/', async () => {
        return prisma.orderStatus.findMany({ orderBy: { display_order: 'asc' } });
    });
}
