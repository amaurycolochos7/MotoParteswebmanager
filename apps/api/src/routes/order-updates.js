import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function orderUpdatesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/order-updates?orderId=
    fastify.get('/', async (request) => {
        const { orderId } = request.query;
        return prisma.orderUpdate.findMany({
            where: orderId ? { order_id: orderId } : {},
            orderBy: { created_at: 'desc' }
        });
    });

    // POST /api/order-updates
    fastify.post('/', async (request) => {
        return prisma.orderUpdate.create({
            data: {
                order_id: request.body.order_id,
                title: request.body.title,
                message: request.body.message || null,
                created_by: request.user.id
            }
        });
    });
}
