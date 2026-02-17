import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

// Helper: generate order number
async function generateOrderNumber() {
    const year = new Date().getFullYear().toString();
    const count = await prisma.order.count({
        where: { order_number: { startsWith: `OS-${year}-` } }
    });
    return `OS-${year}-${String(count + 1).padStart(4, '0')}`;
}

// Helper: recalculate order totals
async function recalcOrderTotals(orderId) {
    const services = await prisma.orderService.findMany({ where: { order_id: orderId } });
    const parts = await prisma.orderPart.findMany({ where: { order_id: orderId } });

    const laborTotal = services.reduce((sum, s) => sum + Number(s.price) * s.quantity, 0);
    const partsTotal = parts.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);

    await prisma.order.update({
        where: { id: orderId },
        data: { labor_total: laborTotal, parts_total: partsTotal, total_amount: laborTotal + partsTotal }
    });
}

const ORDER_INCLUDE = {
    client: true,
    motorcycle: true,
    mechanic: { select: { id: true, full_name: true, phone: true, commission_percentage: true, is_master_mechanic: true } },
    approver: { select: { id: true, full_name: true, phone: true } },
    status: true,
    services: true,
    parts: true,
    photos: true,
    history: { orderBy: { created_at: 'desc' } },
    updates: { orderBy: { created_at: 'desc' } },
};

export default async function ordersRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/orders
    fastify.get('/', async (request) => {
        const { mechanicId } = request.query;
        const where = mechanicId ? { mechanic_id: mechanicId } : {};
        return prisma.order.findMany({
            where,
            include: ORDER_INCLUDE,
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/orders/:id
    fastify.get('/:id', async (request, reply) => {
        const order = await prisma.order.findUnique({
            where: { id: request.params.id },
            include: ORDER_INCLUDE
        });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
        return order;
    });

    // GET /api/orders/token/:token (public - no auth needed for this one)
    fastify.get('/public/:token', async (request, reply) => {
        // Remove auth for public portal access
        const order = await prisma.order.findUnique({
            where: { public_token: request.params.token },
            include: {
                client: true,
                motorcycle: true,
                mechanic: { select: { id: true, full_name: true, phone: true } },
                status: true,
                services: true,
                parts: true,
                photos: true,
                updates: { orderBy: { created_at: 'desc' } }
            }
        });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });

        // Update last seen
        await prisma.order.update({
            where: { id: order.id },
            data: { client_last_seen_at: new Date() }
        });

        return order;
    });

    // GET /api/orders/client/:clientId
    fastify.get('/client/:clientId', async (request) => {
        return prisma.order.findMany({
            where: { client_id: request.params.clientId },
            include: ORDER_INCLUDE,
            orderBy: { created_at: 'desc' }
        });
    });

    // POST /api/orders
    fastify.post('/', async (request) => {
        const data = request.body;
        const orderNumber = await generateOrderNumber();

        // Generate public token
        const { nanoid } = await import('nanoid');
        const publicToken = nanoid(12);

        const order = await prisma.order.create({
            data: {
                order_number: orderNumber,
                client_id: data.client_id || null,
                motorcycle_id: data.motorcycle_id || null,
                mechanic_id: data.mechanic_id || null,
                approved_by: data.approved_by || null,
                status_id: data.status_id,
                customer_complaint: data.customer_complaint || null,
                initial_diagnosis: data.initial_diagnosis || null,
                mechanic_notes: data.mechanic_notes || null,
                advance_payment: data.advance_payment || 0,
                payment_method: data.payment_method || null,
                public_token: publicToken,
                client_link: `/orden/${publicToken}`,
            },
            include: ORDER_INCLUDE
        });

        // Add services if provided
        if (data.services && data.services.length > 0) {
            await prisma.orderService.createMany({
                data: data.services.map(s => ({
                    order_id: order.id,
                    service_id: s.service_id || null,
                    name: s.name,
                    price: s.price,
                    cost: s.cost || 0,
                    quantity: s.quantity || 1,
                    notes: s.notes || null
                }))
            });
            await recalcOrderTotals(order.id);
        }

        // Add history entry
        await prisma.orderHistory.create({
            data: {
                order_id: order.id,
                changed_by: request.user.id,
                new_status: 'Registrada',
                notes: 'Orden creada'
            }
        });

        // Return full order
        return prisma.order.findUnique({
            where: { id: order.id },
            include: ORDER_INCLUDE
        });
    });

    // PUT /api/orders/:id
    fastify.put('/:id', async (request) => {
        const { id } = request.params;
        const data = { ...request.body };
        delete data.id;
        delete data.created_at;
        delete data.client;
        delete data.motorcycle;
        delete data.mechanic;
        delete data.approver;
        delete data.status;
        delete data.services;
        delete data.parts;
        delete data.photos;
        delete data.history;
        delete data.updates;
        delete data.earnings;

        return prisma.order.update({
            where: { id },
            data,
            include: ORDER_INCLUDE
        });
    });

    // PUT /api/orders/:id/status
    fastify.put('/:id/status', async (request) => {
        const { id } = request.params;
        const { status_id, notes } = request.body;

        // Get old status
        const oldOrder = await prisma.order.findUnique({
            where: { id },
            include: { status: true }
        });

        const newStatus = await prisma.orderStatus.findUnique({ where: { id: status_id } });

        // Update order
        const order = await prisma.order.update({
            where: { id },
            data: {
                status_id,
                completed_at: newStatus?.is_terminal ? new Date() : undefined
            },
            include: ORDER_INCLUDE
        });

        // Record history
        await prisma.orderHistory.create({
            data: {
                order_id: id,
                changed_by: request.user.id,
                old_status: oldOrder?.status?.name || null,
                new_status: newStatus?.name || 'Desconocido',
                notes: notes || null
            }
        });

        return order;
    });

    // PUT /api/orders/:id/paid
    fastify.put('/:id/paid', async (request) => {
        return prisma.order.update({
            where: { id: request.params.id },
            data: { is_paid: true, paid_at: new Date() },
            include: ORDER_INCLUDE
        });
    });

    // POST /api/orders/:id/services
    fastify.post('/:id/services', async (request) => {
        const { id } = request.params;
        const data = request.body;

        const service = await prisma.orderService.create({
            data: {
                order_id: id,
                service_id: data.service_id || null,
                name: data.name,
                price: data.price,
                cost: data.cost || 0,
                quantity: data.quantity || 1,
                notes: data.notes || null
            }
        });

        await recalcOrderTotals(id);
        return service;
    });

    // DELETE /api/orders/:id/services/:serviceId
    fastify.delete('/:id/services/:serviceId', async (request) => {
        await prisma.orderService.delete({ where: { id: request.params.serviceId } });
        await recalcOrderTotals(request.params.id);
        return { success: true };
    });

    // POST /api/orders/:id/parts
    fastify.post('/:id/parts', async (request) => {
        const { id } = request.params;
        const part = await prisma.orderPart.create({
            data: { order_id: id, ...request.body }
        });
        await recalcOrderTotals(id);
        return part;
    });

    // DELETE /api/orders/:id/parts/:partId
    fastify.delete('/:id/parts/:partId', async (request) => {
        await prisma.orderPart.delete({ where: { id: request.params.partId } });
        await recalcOrderTotals(request.params.id);
        return { success: true };
    });

    // DELETE /api/orders/:id
    fastify.delete('/:id', async (request) => {
        const { id } = request.params;

        // Cascade delete
        await prisma.mechanicEarning.deleteMany({ where: { order_id: id } });
        await prisma.orderService.deleteMany({ where: { order_id: id } });
        await prisma.orderUpdate.deleteMany({ where: { order_id: id } });
        await prisma.orderPhoto.deleteMany({ where: { order_id: id } });
        await prisma.orderPart.deleteMany({ where: { order_id: id } });
        await prisma.orderHistory.deleteMany({ where: { order_id: id } });
        await prisma.order.delete({ where: { id } });

        return { success: true };
    });
}
