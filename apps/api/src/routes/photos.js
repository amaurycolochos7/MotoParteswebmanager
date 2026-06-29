import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';

export default async function photosRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // POST /api/photos - Upload photo (URL-based, storage handled by frontend or external)
    fastify.post('/', async (request) => {
        const data = request.body;
        // ELIHU: evidencia retenida 30 días. expires_at lo fija el backend
        // (no se confía en el cliente). category = tipo de foto.
        const retentionDays = Number(process.env.PHOTO_RETENTION_DAYS) || 30;
        const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
        return prisma.orderPhoto.create({
            data: {
                order_id: data.order_id,
                url: data.url,
                category: data.category || 'evidence',
                caption: data.caption || null,
                uploaded_by: request.user.id,
                expires_at: expiresAt,
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
