import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function orderRequestsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/order-requests/masters
    fastify.get('/masters', async () => {
        return prisma.profile.findMany({
            where: { is_master_mechanic: true, is_active: true },
            select: { id: true, full_name: true, phone: true, commission_percentage: true }
        });
    });

    // GET /api/order-requests/pending/:masterId
    fastify.get('/pending/:masterId', async (request) => {
        return prisma.orderRequest.findMany({
            where: { requested_to: request.params.masterId, status: 'pending' },
            include: {
                requester: { select: { id: true, full_name: true, phone: true, commission_percentage: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/order-requests/pending-count/:masterId
    fastify.get('/pending-count/:masterId', async (request) => {
        const count = await prisma.orderRequest.count({
            where: { requested_to: request.params.masterId, status: 'pending' }
        });
        return { count };
    });

    // GET /api/order-requests/by-auxiliary/:auxiliaryId
    fastify.get('/by-auxiliary/:auxiliaryId', async (request) => {
        return prisma.orderRequest.findMany({
            where: { requested_by: request.params.auxiliaryId },
            include: {
                approver: { select: { id: true, full_name: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/order-requests/auxiliaries/:masterId
    fastify.get('/auxiliaries/:masterId', async (request) => {
        const masterId = request.params.masterId;

        // Get all orders approved by this master
        const orders = await prisma.order.findMany({
            where: { approved_by: masterId },
            include: {
                mechanic: { select: { id: true, full_name: true, commission_percentage: true } },
                client: { select: { full_name: true } }
            }
        });

        // Get earnings for these orders
        const orderIds = orders.map(o => o.id);
        const earnings = orderIds.length > 0 ? await prisma.mechanicEarning.findMany({
            where: { order_id: { in: orderIds } }
        }) : [];

        const paidOrderIds = new Set(earnings.filter(e => e.is_paid || e.payment_request_id).map(e => e.order_id));
        const unpaidEarnings = {};
        earnings.forEach(e => { if (!e.is_paid && !e.payment_request_id) unpaidEarnings[e.order_id] = e; });

        // Group by auxiliary
        const auxMap = {};
        orders.forEach(order => {
            const auxId = order.mechanic_id;
            if (!auxId || paidOrderIds.has(order.id)) return;

            if (!auxMap[auxId]) {
                auxMap[auxId] = {
                    mechanic_id: auxId,
                    mechanic_name: order.mechanic?.full_name || 'Auxiliar',
                    commission_percentage: Number(order.mechanic?.commission_percentage || 10),
                    total_orders: 0, total_labor: 0, total_earned: 0, pending_payment: 0,
                    pending_orders_list: []
                };
            }

            const labor = Number(order.labor_total) || 0;
            const rate = auxMap[auxId].commission_percentage / 100;
            const earning = unpaidEarnings[order.id];
            const commission = earning ? Number(earning.earned_amount) : labor * rate;

            auxMap[auxId].total_orders++;
            auxMap[auxId].total_labor += labor;
            auxMap[auxId].total_earned += commission;
            auxMap[auxId].pending_payment += commission;
            auxMap[auxId].pending_orders_list.push({
                id: order.id,
                earning_id: earning?.id || null,
                order_number: order.order_number,
                client_name: order.client?.full_name || 'Particular',
                labor_amount: labor,
                commission
            });
        });

        // Include auxiliaries with pending requests even if no orders
        const pendingRequests = await prisma.orderRequest.findMany({
            where: { requested_to: masterId, status: 'pending' },
            include: {
                requester: { select: { id: true, full_name: true, commission_percentage: true } }
            }
        });

        pendingRequests.forEach(req => {
            const auxId = req.requested_by;
            if (!auxMap[auxId]) {
                auxMap[auxId] = {
                    mechanic_id: auxId,
                    mechanic_name: req.requester?.full_name || 'Auxiliar',
                    commission_percentage: Number(req.requester?.commission_percentage || 10),
                    total_orders: 0, total_labor: 0, total_earned: 0, pending_payment: 0,
                    pending_orders_list: []
                };
            }
        });

        return Object.values(auxMap);
    });

    // POST /api/order-requests
    fastify.post('/', async (request) => {
        return prisma.orderRequest.create({
            data: {
                requested_by: request.body.requested_by,
                requested_to: request.body.requested_to,
                order_data: request.body.order_data || null,
                status: 'pending'
            }
        });
    });

    // PUT /api/order-requests/:id/approve
    fastify.put('/:id/approve', async (request) => {
        return prisma.orderRequest.update({
            where: { id: request.params.id },
            data: {
                status: 'approved',
                response_notes: request.body.notes || null,
                created_order_id: request.body.created_order_id || null,
                responded_at: new Date()
            }
        });
    });

    // PUT /api/order-requests/:id/reject
    fastify.put('/:id/reject', async (request) => {
        return prisma.orderRequest.update({
            where: { id: request.params.id },
            data: {
                status: 'rejected',
                response_notes: request.body.notes || null,
                responded_at: new Date()
            }
        });
    });
}
