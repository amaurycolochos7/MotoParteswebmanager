import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function whatsappRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/whatsapp/sessions
    fastify.get('/sessions', async () => {
        return prisma.whatsappSession.findMany({
            include: { mechanic: { select: { id: true, full_name: true, phone: true, is_master_mechanic: true } } }
        });
    });

    // GET /api/whatsapp/sessions/:mechanicId
    fastify.get('/sessions/:mechanicId', async (request) => {
        return prisma.whatsappSession.findUnique({
            where: { mechanic_id: request.params.mechanicId },
            include: { mechanic: { select: { id: true, full_name: true, phone: true } } }
        });
    });

    // PUT /api/whatsapp/sessions/:mechanicId
    fastify.put('/sessions/:mechanicId', async (request) => {
        return prisma.whatsappSession.upsert({
            where: { mechanic_id: request.params.mechanicId },
            update: request.body,
            create: { mechanic_id: request.params.mechanicId, ...request.body }
        });
    });
}
