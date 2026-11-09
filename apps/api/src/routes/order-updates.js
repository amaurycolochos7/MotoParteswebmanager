import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { guardOrder, visibleMechanicIds, orderScope } from '../lib/visibility.js';

export default async function orderUpdatesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);
    fastify.addHook('preHandler', guardOrder((r) => r.query?.orderId || r.body?.order_id || null));

    // GET /api/order-updates?orderId=
    fastify.get('/', async (request) => {
        const { orderId } = request.query;
        const ids = await visibleMechanicIds(request);
        return prisma.orderUpdate.findMany({
            where: { ...(orderId ? { order_id: orderId } : {}), ...(ids === null ? {} : { order: orderScope(ids, request.user.id) }) },
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
