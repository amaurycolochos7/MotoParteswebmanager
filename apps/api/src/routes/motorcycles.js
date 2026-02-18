import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function motorcyclesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/motorcycles?clientId=
    fastify.get('/', async (request) => {
        const { clientId } = request.query;
        if (clientId) {
            return prisma.motorcycle.findMany({
                where: { client_id: clientId },
                orderBy: { created_at: 'desc' }
            });
        }
        return prisma.motorcycle.findMany({ orderBy: { created_at: 'desc' } });
    });

    // POST /api/motorcycles
    fastify.post('/', async (request, reply) => {
        try {
            return await prisma.motorcycle.create({ data: request.body });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Error al crear motocicleta', details: error.message });
        }
    });

    // PUT /api/motorcycles/:id
    fastify.put('/:id', async (request) => {
        return prisma.motorcycle.update({
            where: { id: request.params.id },
            data: request.body
        });
    });

    // DELETE /api/motorcycles/:id
    fastify.delete('/:id', async (request) => {
        await prisma.motorcycle.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}
