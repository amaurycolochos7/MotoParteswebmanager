import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function photosRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // POST /api/photos - Upload photo (URL-based, storage handled by frontend or external)
    fastify.post('/', async (request) => {
        const data = request.body;
        return prisma.orderPhoto.create({
            data: {
                order_id: data.order_id,
                url: data.url,
                category: data.category || 'evidence',
                caption: data.caption || null,
                uploaded_by: request.user.id,
            }
        });
    });

    // GET /api/photos?orderId=
    fastify.get('/', async (request) => {
        const { orderId } = request.query;
        return prisma.orderPhoto.findMany({
            where: orderId ? { order_id: orderId } : {},
            orderBy: { created_at: 'desc' }
        });
    });

    // DELETE /api/photos/:id
    fastify.delete('/:id', async (request) => {
        await prisma.orderPhoto.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}
