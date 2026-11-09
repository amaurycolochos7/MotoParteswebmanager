import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { assertWithinLimit, incrementUsageAsync, PlanLimitError } from '../lib/billing.js';
import { fireEvent } from '../lib/events.js';
import { generateOrderNumber } from '../lib/order-number.js';
import { computeOrderFinance } from '../lib/payments.js';
import { syncOrderEarnings, releaseCommissionIfPaid } from '../lib/commissions.js';
import { statusKeyOf } from '../lib/default-messages.js';
import { sendWhatsApp } from '../lib/appointment-flow.js';

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

// ELIHU 14: el auxiliar puede CREAR orden pero NO cambiar precios/costos,
// marcar pagado, dar descuentos, editar pagos, borrar órdenes ni cambiar
// comisión. Estos son los roles que SÍ pueden tocar dinero.
// (role 'mechanic' = maestro; 'auxiliary' = auxiliar)
function canEditMoney(request) {
    if (['owner', 'admin', 'mechanic'].includes(request.workspaceRole)) return true;
    return (request.workspacePermissions || {}).can_edit_costs === true;
}
function denyMoney(reply) {
    return reply.status(403).send({
        error: 'No tienes permiso para modificar precios, costos o pagos de la orden.',
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
                client: { select: { id: true, full_name: true } },
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
        app.addHook('preHandler', resolveWorkspace);

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

        // POST /api/orders — gated by the workspace's plan orders_per_month.
        app.post('/', async (request, reply) => {
            try {
                await assertWithinLimit(request.workspace.id, 'orders_count');
            } catch (err) {
                if (err instanceof PlanLimitError) {
                    return reply.status(402).send({
                        error: err.message,
                        code: 'PLAN_LIMIT',
                        feature: err.feature,
                        limit: err.limit,
                        used: err.used,
                    });
                }
                throw err;
            }
            const data = { ...(request.body || {}) };
            const folioPrefix = request.workspace?.folio_prefix || 'MP';

            // ── Cliente / moto / mecanico preferido ──────────────────────────
            // - Si el cliente tiene motos, la orden DEBE llevar una de ellas
            //   (asi el servicio queda en el historial de esa moto).
            // - Si tiene exactamente una y no llega, se asigna sola.
            // - Si no tiene ninguna, se permite crear sin moto (el panel ofrece agregarla).
            // - Si no llega mechanic_id y quien crea es owner/admin, se usa el mecanico
            //   preferido del cliente (si sigue activo). Al mecanico no-admin NO se le fuerza nada:
            //   el panel manda su propio id.
            let orderClient = null;
            if (data.client_id) {
                orderClient = await prisma.client.findFirst({
                    where: { id: data.client_id },
                    include: { motorcycles: { select: { id: true, brand: true, model: true, year: true } } },
                });
                if (!orderClient) return reply.status(400).send({ error: 'Cliente no encontrado en este taller.' });
                const motoIds = orderClient.motorcycles.map((m) => m.id);
                if (data.motorcycle_id) {
                    if (!motoIds.includes(data.motorcycle_id)) {
                        return reply.status(400).send({ error: 'La moto no pertenece a ese cliente.' });
                    }
                } else if (motoIds.length === 1) {
                    data.motorcycle_id = motoIds[0];
                } else if (motoIds.length > 1) {
                    return reply.status(400).send({ error: 'Elige la moto del cliente.' });
                }
            }
            const preferredId = orderClient?.preferred_mechanic_id || null;
            let preferredProfile = null;
            if (preferredId) {
                preferredProfile = await prisma.profile.findUnique({
                    where: { id: preferredId },
                    select: { id: true, full_name: true, phone: true, is_active: true },
                });
                if (preferredProfile && !preferredProfile.is_active) preferredProfile = null;
            }
            if (!data.mechanic_id && preferredProfile && ['owner', 'admin'].includes(request.workspaceRole)) {
                data.mechanic_id = preferredProfile.id;
            }

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

            // Retry on P2002 (order_number unique collision) to absorb races
            // between concurrent creates that resolve the same next suffix.
            let order;
            let lastErr;
            for (let attempt = 0; attempt < 6; attempt++) {
                const orderNumber = await generateOrderNumber(folioPrefix);
                try {
                    order = await prisma.order.create({
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
                    break;
                } catch (err) {
                    lastErr = err;
                    if (err.code === 'P2002' && Array.isArray(err.meta?.target) && err.meta.target.includes('order_number')) {
                        request.log.warn({ attempt, orderNumber }, 'order_number collision, retrying');
                        continue;
                    }
                    throw err;
                }
            }
            if (!order) throw lastErr;

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

            // Bump plan usage counter for the workspace. Fire-and-forget —
            // a failure shouldn't roll back an already-created order.
            incrementUsageAsync(request.workspace.id, 'orders_count', 1);

            // Fire automations trigger (async, non-blocking).
            fireEvent('order.created', {
                workspaceId: request.workspace.id,
                order_id: order.id,
                client_id: order.client_id,
                motorcycle_id: order.motorcycle_id,
            });

            // Un cliente de cita web deja de estar "por confirmar" al abrirle una orden.
            if (orderClient?.web_unconfirmed) {
                await prisma.client.updateMany({ where: { id: orderClient.id }, data: { web_unconfirmed: false } })
                    .catch((e) => request.log.warn({ err: e.message }, 'web_unconfirmed no se pudo limpiar'));
            }

            // Aviso al mecanico preferido del cliente (si no es quien abre la orden). No bloquea.
            if (preferredProfile && preferredProfile.id !== request.user.id && preferredProfile.phone) {
                const moto = orderClient.motorcycles.find((m) => m.id === order.motorcycle_id);
                const motoTxt = moto ? ` con su ${[moto.brand, moto.model, moto.year].filter(Boolean).join(' ')}` : '';
                const base = (process.env.PUBLIC_APP_URL || 'https://motopartes.cloud').replace(/\/$/, '');
                const mine = order.mechanic_id === preferredProfile.id;
                const text =
                    `Hola ${String(preferredProfile.full_name || '').split(' ')[0]}. ` +
                    (mine
                        ? `Se abrió la orden ${order.order_number} de tu cliente ${orderClient.full_name}${motoTxt}, a tu nombre.`
                        : `Llegó tu cliente ${orderClient.full_name}${motoTxt}. Se abrió la orden ${order.order_number} con otro mecánico.`) +
                    `\nRevísala aquí: ${base}/mechanic/order/${order.id}`;
                sendWhatsApp(request.workspace.id, preferredProfile.phone, text)
                    .catch((e) => request.log.warn({ err: e.message }, 'aviso a mecanico preferido fallo'));
            }

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
            // ELIHU 14: si el rol no puede tocar dinero, ignorar campos
            // monetarios aunque vengan en el body (defensa en backend, no solo UI).
            if (!canEditMoney(request)) {
                delete data.labor_total; delete data.parts_total; delete data.total_amount;
                delete data.advance_payment; delete data.is_paid; delete data.paid_at;
                delete data.payment_method;
            }
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
        app.put('/:id/status', async (request, reply) => {
            const { id } = request.params;
            const { status_id, notes } = request.body;

            // Get old status
            const oldOrder = await prisma.order.findUnique({
                where: { id },
                include: { status: true }
            });

            const newStatus = await prisma.orderStatus.findUnique({ where: { id: status_id } });

            // ELIHU J (backend enforcement): entregar con saldo pendiente.
            // Si el nuevo estado es "Entregada" y la orden tiene saldo > 0:
            //   - el auxiliar NUNCA puede (403),
            //   - el maestro/dueño puede SOLO si manda una nota de autorización (si no, 400),
            //   - la nota queda registrada en el historial.
            let effectiveNotes = notes;
            const isDelivered = /entregada/i.test(newStatus?.name || '');
            if (isDelivered) {
                const payments = await prisma.orderPayment.findMany({ where: { order_id: id } });
                const finance = computeOrderFinance(oldOrder || {}, payments);
                if (finance.balance > 0) {
                    if (!canEditMoney(request)) {
                        return reply.status(403).send({
                            error: 'No puedes marcar como Entregada una orden con saldo pendiente. Requiere autorización del maestro/dueño.',
                        });
                    }
                    const reason = (notes || '').trim();
                    if (!reason) {
                        return reply.status(400).send({
                            error: `La orden tiene saldo pendiente de $${finance.balance}. Para entregar con saldo, incluye una nota de autorización.`,
                            balance: finance.balance,
                        });
                    }
                    effectiveNotes = `[ENTREGA CON SALDO $${finance.balance}] ${reason}`;
                }
            }

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
                    notes: effectiveNotes || null
                }
            });

            // Fire status-change event; the filter { status_name: '...' } on
            // an automation decides whether it reacts. If the new status is
            // terminal, also fire order.completed.
            // V2: el SERVIDOR es el unico que avisa al cliente del cambio de estado (la pantalla ya no manda
            // WhatsApp). status_key permite filtrar por estado aunque cada taller lo nombre distinto.
            // Solo si el estado realmente cambio (re-aplicar el mismo no vuelve a disparar nada).
            if (oldOrder?.status_id !== status_id) {
                fireEvent('order.status_changed', {
                    workspaceId: request.workspace.id,
                    order_id: id,
                    client_id: order.client_id,
                    status_name: newStatus?.name || null,
                    status_key: statusKeyOf(newStatus?.name),
                });
            }
            if (newStatus?.is_terminal) {
                fireEvent('order.completed', {
                    workspaceId: request.workspace.id,
                    order_id: id,
                    client_id: order.client_id,
                });
            }

            return order;
        });

        // PUT /api/orders/:id/paid
        app.put('/:id/paid', async (request, reply) => {
            if (!canEditMoney(request)) return denyMoney(reply);
            const { id } = request.params;

            const result = await prisma.$transaction(async (tx) => {
                // Recalculate totals from services + parts before marking paid.
                // This ensures labor_total is correct even if /:id/costs was never called.
                const services = await tx.orderService.findMany({ where: { order_id: id } });
                const parts = await tx.orderPart.findMany({ where: { order_id: id } });

                const svcLaborTotal = services.reduce((sum, s) => {
                    const price = Number(s.price) * s.quantity;
                    const matCost = Number(s.cost) * s.quantity;
                    return sum + (price - matCost);
                }, 0);
                const svcPartsTotal = services.reduce((sum, s) => sum + Number(s.cost) * s.quantity, 0);
                const orderPartsTotal = parts.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);

                const laborTotal = svcLaborTotal;
                const partsTotal = svcPartsTotal + orderPartsTotal;

                const updated = await tx.order.update({
                    where: { id },
                    data: {
                        is_paid: true,
                        paid_at: new Date(),
                        labor_total: laborTotal,
                        parts_total: partsTotal,
                        total_amount: laborTotal + partsTotal,
                    },
                    include: ORDER_INCLUDE,
                });

                // Comisiones del mecanico (y de su maestro si es auxiliar): lib/commissions.js
                await syncOrderEarnings(tx, {
                    orderId: id,
                    workspaceId: updated.workspace_id,
                    mechanicId: updated.mechanic_id,
                    laborTotal,
                });
                await releaseCommissionIfPaid(tx, id);

                return updated;
            });

            fireEvent('order.paid', {
                workspaceId: request.workspace.id,
                order_id: result.id,
                client_id: result.client_id,
            });
            return result;
        });

        // POST /api/orders/:id/services
        app.post('/:id/services', async (request, reply) => {
            if (!canEditMoney(request)) return denyMoney(reply);
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
        app.delete('/:id/services/:serviceId', async (request, reply) => {
            if (!canEditMoney(request)) return denyMoney(reply);
            await prisma.orderService.delete({ where: { id: request.params.serviceId } });
            await recalcOrderTotals(request.params.id);
            return { success: true };
        });

        // POST /api/orders/:id/parts
        app.post('/:id/parts', async (request, reply) => {
            if (!canEditMoney(request)) return denyMoney(reply);
            const { id } = request.params;
            const part = await prisma.orderPart.create({
                data: { order_id: id, ...request.body }
            });
            await recalcOrderTotals(id);
            return part;
        });

        // DELETE /api/orders/:id/parts/:partId
        app.delete('/:id/parts/:partId', async (request, reply) => {
            if (!canEditMoney(request)) return denyMoney(reply);
            await prisma.orderPart.delete({ where: { id: request.params.partId } });
            await recalcOrderTotals(request.params.id);
            return { success: true };
        });

        // DELETE /api/orders/:id
        app.delete('/:id', async (request, reply) => {
            // Borrar orden es destructivo: solo owner/admin/maestro, o permiso
            // explícito can_delete_orders. El auxiliar NO puede (ELIHU 14).
            const canDelete =
                ['owner', 'admin', 'mechanic'].includes(request.workspaceRole) ||
                (request.workspacePermissions || {}).can_delete_orders === true;
            if (!canDelete) {
                return reply.status(403).send({ error: 'No tienes permiso para borrar órdenes.' });
            }
            const { id } = request.params;

            try {
                await prisma.$transaction(async (tx) => {

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

                });

                return { success: true };
            } catch (err) {
                // Use single-arg form so Pino actually serializes the error,
                // and surface the Prisma error code in the response so we can
                // diagnose constraint violations from the client.
                request.log.error({ err, orderId: id }, 'Error deleting order');

                return reply.status(400).send({
                    error: err.message || 'Error al eliminar la orden',
                    code: err.code || null,
                });
            }
        });

        // ============ UPDATE ORDER COSTS (labor + parts) ============
        fastify.put('/:id/costs', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
            if (!canEditMoney(request)) return denyMoney(reply);
            const { id } = request.params;
            const { labor_total, parts, mark_as_paid } = request.body;

            try {
                const result = await prisma.$transaction(async (tx) => {
                    // Drop stale triggers that might exist on the DB tables
                    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS update_order_totals_on_parts ON order_parts`);
                    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS update_order_totals_on_service ON order_services`);

                    // 1. Delete existing parts for this order
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
                    const updateData = {
                        labor_total: laborAmount,
                        parts_total: partsTotal,
                        total_amount: totalAmount,
                    };

                    if (mark_as_paid === true) {
                        updateData.is_paid = true;
                        updateData.paid_at = new Date();
                    }

                    const updated = await tx.order.update({
                        where: { id },
                        data: updateData,
                        include: ORDER_INCLUDE,
                    });

                    // ============ COMISIONES (lib/commissions.js) ============
                    // La comisión del mecánico (y de su maestro, si es auxiliar) se crea/actualiza al guardar la mano de obra:
                    // queda pendiente hasta que el cliente liquide (por abonos o al marcar pagada) y entonces se libera.
                    // Una comisión que ya se pagó al mecánico no se toca.
                    await syncOrderEarnings(tx, {
                        orderId: id,
                        workspaceId: updated.workspace_id,
                        mechanicId: updated.mechanic_id,
                        laborTotal: updated.labor_total,
                    });
                    await releaseCommissionIfPaid(tx, id);

                    return updated;
                });

                return result;
            } catch (err) {
                request.log.error('Error updating order costs:', err);

                return reply.status(400).send({
                    error: err.message || 'Error al actualizar costos'
                });
            }
        });
    });
}

