import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { guardOrder, visibleMechanicIds, orderScope } from '../lib/visibility.js';

export default async function photosRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);
    fastify.addHook('preHandler', guardOrder(async (r) => {
        if (r.query?.orderId) return r.query.orderId;
        if (r.body?.order_id) return r.body.order_id;
        if (r.params?.id) {
            const p = await prisma.orderPhoto.findFirst({ where: { id: r.params.id }, select: { order_id: true } });
            return p?.order_id || null;
        }
        return null;
    }));

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
        const ids = await visibleMechanicIds(request);
        return prisma.orderPhoto.findMany({
            where: { ...(orderId ? { order_id: orderId } : {}), ...(ids === null ? {} : { order: orderScope(ids, request.user.id) }) },
            orderBy: { created_at: 'desc' }
        });
    });

    // DELETE /api/photos/:id
    fastify.delete('/:id', async (request) => {
        await prisma.orderPhoto.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}
