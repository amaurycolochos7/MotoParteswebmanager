import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function servicesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    fastify.get('/', async () => {
        return prisma.service.findMany({ orderBy: { display_order: 'asc' } });
    });

    fastify.post('/', async (request) => {
        return prisma.service.create({ data: request.body });
    });

    fastify.put('/:id', async (request) => {
        return prisma.service.update({
            where: { id: request.params.id },
            data: request.body
        });
    });

    fastify.delete('/:id', async (request) => {
        await prisma.service.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}
