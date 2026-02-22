import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

// Helper: generate order number (MP-YY-NN format)
async function generateOrderNumber() {
    const shortYear = String(new Date().getFullYear()).slice(-2);
    const count = await prisma.order.count({
        where: { order_number: { startsWith: `MP-${shortYear}-` } }
    });
    return `MP-${shortYear}-${String(count + 1).padStart(2, '0')}`;
}

// Helper: recalculate order totals
// price = total per service (labor + materials), cost = materials portion
// labor = price - cost
async function recalcOrderTotals(orderId) {
    const services = await prisma.orderService.findMany({ where: { order_id: orderId } });
    const parts = await prisma.orderPart.findMany({ where: { order_id: orderId } });

    // Services: labor = price - cost (materials), materials = cost
    const svcLaborTotal = services.reduce((sum, s) => {
        const price = Number(s.price) * s.quantity;
        const matCost = Number(s.cost) * s.quantity;
        return sum + (price - matCost);
    }, 0);
    const svcPartsTotal = services.reduce((sum, s) => sum + Number(s.cost) * s.quantity, 0);

    // Order parts (refacciones sueltas)
    const orderPartsTotal = parts.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);

    const laborTotal = svcLaborTotal;
    const partsTotal = svcPartsTotal + orderPartsTotal;

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
    // ── PUBLIC ROUTE (no auth) ── registered at plugin level WITHOUT auth
    fastify.get('/public/:token', async (request, reply) => {
        const order = await prisma.order.findUnique({
            where: { public_token: request.params.token },
            include: {
                client: { select: { id: true, name: true } },
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

        await prisma.order.update({
            where: { id: order.id },
            data: { client_last_seen_at: new Date() }
        });

        return order;
    });

    // ── ALL ROUTES BELOW REQUIRE AUTH ──
    // Wrapped in a sub-plugin so the auth hook only applies to these routes
    fastify.register(async function authenticatedRoutes(app) {
        app.addHook('preHandler', authenticate);

        // GET /api/orders
        app.get('/', async (request) => {
            const { mechanicId } = request.query;
            const where = mechanicId ? { mechanic_id: mechanicId } : {};
            return prisma.order.findMany({
                where,
                include: ORDER_INCLUDE,
                orderBy: { created_at: 'desc' }
            });
        });

        // GET /api/orders/:id
        app.get('/:id', async (request, reply) => {
            const order = await prisma.order.findUnique({
                where: { id: request.params.id },
                include: ORDER_INCLUDE
            });
            if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
            return order;
        });

        // GET /api/orders/client/:clientId
        app.get('/client/:clientId', async (request) => {
            return prisma.order.findMany({
                where: { client_id: request.params.clientId },
                include: ORDER_INCLUDE,
                orderBy: { created_at: 'desc' }
            });
        });

        // POST /api/orders
        app.post('/', async (request) => {
            const data = request.body;
            const orderNumber = await generateOrderNumber();

            // Generate public token
            const { nanoid } = await import('nanoid');
            const publicToken = nanoid(12);

            // Auto-resolve status_id if not provided — find the first (lowest display_order) non-terminal status
            let statusId = data.status_id || null;
            if (!statusId) {
                const initialStatus = await prisma.orderStatus.findFirst({
                    where: { is_terminal: false },
                    orderBy: { display_order: 'asc' }
                });
                statusId = initialStatus?.id || null;
            }

            const order = await prisma.order.create({
                data: {
                    order_number: orderNumber,
                    client_id: data.client_id || null,
                    motorcycle_id: data.motorcycle_id || null,
                    mechanic_id: data.mechanic_id || null,
                    approved_by: data.approved_by || null,
                    status_id: statusId,
                    customer_complaint: data.customer_complaint || null,
                    initial_diagnosis: data.initial_diagnosis || null,
                    mechanic_notes: data.mechanic_notes || null,
                    advance_payment: data.advance_payment ? parseFloat(data.advance_payment) : 0,
                    payment_method: data.payment_method || null,
                    public_token: publicToken,
                    client_link: `/orden/${publicToken}`,
                },
                include: ORDER_INCLUDE
            });

            // Add services if provided (filter to only known OrderService fields)
            if (data.services && data.services.length > 0) {
                await prisma.orderService.createMany({
                    data: data.services.map(s => ({
                        order_id: order.id,
                        service_id: s.service_id || null,
                        name: s.name,
                        price: parseFloat(s.price) || 0,
                        cost: parseFloat(s.cost) || 0,
                        quantity: parseInt(s.quantity) || 1,
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
        app.put('/:id', async (request) => {
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
        app.put('/:id/status', async (request) => {
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
        app.put('/:id/paid', async (request) => {
            return prisma.order.update({
                where: { id: request.params.id },
                data: { is_paid: true, paid_at: new Date() },
                include: ORDER_INCLUDE
            });
        });

        // POST /api/orders/:id/services
        app.post('/:id/services', async (request) => {
            const { id } = request.params;
            const data = request.body;

            // price = total (labor + parts), cost = materials/parts portion
            const laborCost = parseFloat(data.laborCost) || 0;
            const partsCost = parseFloat(data.partsCost) || 0;
            const totalPrice = parseFloat(data.price) || (laborCost + partsCost);

            await prisma.orderService.create({
                data: {
                    order_id: id,
                    service_id: data.service_id || null,
                    name: data.name,
                    price: totalPrice,
                    cost: partsCost,
                    quantity: data.quantity || 1,
                    notes: data.notes || null
                }
            });

            await recalcOrderTotals(id);

            // Return full updated order so frontend has fresh data
            return prisma.order.findUnique({
                where: { id },
                include: ORDER_INCLUDE
            });
        });

        // DELETE /api/orders/:id/services/:serviceId
        app.delete('/:id/services/:serviceId', async (request) => {
            await prisma.orderService.delete({ where: { id: request.params.serviceId } });
            await recalcOrderTotals(request.params.id);
            return { success: true };
        });

        // POST /api/orders/:id/parts
        app.post('/:id/parts', async (request) => {
            const { id } = request.params;
            const part = await prisma.orderPart.create({
                data: { order_id: id, ...request.body }
            });
            await recalcOrderTotals(id);
            return part;
        });

        // DELETE /api/orders/:id/parts/:partId
        app.delete('/:id/parts/:partId', async (request) => {
            await prisma.orderPart.delete({ where: { id: request.params.partId } });
            await recalcOrderTotals(request.params.id);
            return { success: true };
        });

        // DELETE /api/orders/:id
        app.delete('/:id', async (request, reply) => {
            const { id } = request.params;

            try {
                await prisma.$transaction(async (tx) => {
                    // 1. Disable the DB trigger that conflicts with cascade deletes
                    //    The trigger tries to UPDATE orders when order_services are deleted,
                    //    which conflicts within the deletion transaction
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE order_services DISABLE TRIGGER update_order_totals_on_service`
                    );
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE order_parts DISABLE TRIGGER update_order_totals_on_parts`
                    );

                    // 2. Nullify references in order_requests
                    await tx.orderRequest.updateMany({
                        where: { created_order_id: id },
                        data: { created_order_id: null }
                    });

                    // 3. Delete mechanic_earnings (no ON DELETE CASCADE in some setups)
                    await tx.mechanicEarning.deleteMany({ where: { order_id: id } });

                    // 4. Delete child records first, then the order
                    await tx.orderService.deleteMany({ where: { order_id: id } });
                    await tx.orderUpdate.deleteMany({ where: { order_id: id } });
                    await tx.orderPhoto.deleteMany({ where: { order_id: id } });
                    await tx.orderPart.deleteMany({ where: { order_id: id } });
                    await tx.orderHistory.deleteMany({ where: { order_id: id } });

                    // 5. Delete the order itself
                    await tx.order.delete({ where: { id } });

                    // 6. Re-enable triggers
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE order_services ENABLE TRIGGER update_order_totals_on_service`
                    );
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE order_parts ENABLE TRIGGER update_order_totals_on_parts`
                    );
                });

                return { success: true };
            } catch (err) {
                request.log.error('Error deleting order:', err);

                // Try to re-enable triggers if they were disabled
                try {
                    await prisma.$executeRawUnsafe(
                        `ALTER TABLE order_services ENABLE TRIGGER update_order_totals_on_service`
                    );
                    await prisma.$executeRawUnsafe(
                        `ALTER TABLE order_parts ENABLE TRIGGER update_order_totals_on_parts`
                    );
                } catch (_) { /* ignore */ }

                return reply.status(400).send({
                    error: err.message || 'Error al eliminar la orden'
                });
            }
        });

        // ============ UPDATE ORDER COSTS (labor + parts) ============
        fastify.put('/:id/costs', { preHandler: [authenticate] }, async (request, reply) => {
            const { id } = request.params;
            const { labor_total, parts } = request.body;

            try {
                const result = await prisma.$transaction(async (tx) => {
                    // 1. Disable triggers to avoid conflicts
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE order_parts DISABLE TRIGGER update_order_totals_on_parts`
                    );

                    // 2. Delete existing parts for this order
                    await tx.orderPart.deleteMany({ where: { order_id: id } });

                    // 3. Create new parts
                    const partsData = (parts || []).map(p => ({
                        order_id: id,
                        name: p.name,
                        cost: parseFloat(p.price) || 0,
                        price: parseFloat(p.price) || 0,
                        quantity: parseInt(p.quantity) || 1,
                        notes: p.notes || null,
                    }));

                    if (partsData.length > 0) {
                        await tx.orderPart.createMany({ data: partsData });
                    }

                    // 4. Calculate totals
                    const partsTotal = partsData.reduce((sum, p) => sum + (p.price * p.quantity), 0);
                    const laborAmount = parseFloat(labor_total) || 0;
                    const totalAmount = laborAmount + partsTotal;

                    // 5. Update order totals
                    const updated = await tx.order.update({
                        where: { id },
                        data: {
                            labor_total: laborAmount,
                            parts_total: partsTotal,
                            total_amount: totalAmount,
                        },
                        include: ORDER_INCLUDE,
                    });

                    // 6. Re-enable triggers
                    await tx.$executeRawUnsafe(
                        `ALTER TABLE order_parts ENABLE TRIGGER update_order_totals_on_parts`
                    );

                    return updated;
                });

                return result;
            } catch (err) {
                request.log.error('Error updating order costs:', err);

                // Try to re-enable triggers
                try {
                    await prisma.$executeRawUnsafe(
                        `ALTER TABLE order_parts ENABLE TRIGGER update_order_totals_on_parts`
                    );
                } catch (_) { /* ignore */ }

                return reply.status(400).send({
                    error: err.message || 'Error al actualizar costos'
                });
            }
        });
    });
}

