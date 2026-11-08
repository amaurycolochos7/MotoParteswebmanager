import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loadActor, canAccessMechanic, isAdminRole, normalizeRole } from '../lib/permissions.js';

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);
const deny = (reply, msg = 'No tienes permiso para esta acción.') => reply.status(403).send({ error: msg });

// V2: antes ninguna de estas rutas comprobaba quién preguntaba. Ahora:
//  - lo del maestro (pendientes, auxiliares) solo lo ve ese maestro o el admin/dueño;
//  - lo de un auxiliar solo lo ve él, su maestro o el admin/dueño.
async function canActAsMaster(request, masterId) {
    const actor = await loadActor(request);
    return isAdminRole(actor.role) || (actor.role === 'maestro' && actor.id === masterId);
}

export default async function orderRequestsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/order-requests/masters
    fastify.get('/masters', async (request) => {
        // Solo maestros de ESTE taller (Profile no tiene auto-scope por taller).
        const members = await unscoped(() => prisma.membership.findMany({
            where: { workspace_id: request.workspace.id, profile: { is_master_mechanic: true, is_active: true } },
            select: { profile: { select: { id: true, full_name: true, phone: true, commission_percentage: true } } },
        }));
        return members.map((m) => m.profile);
    });

    // GET /api/order-requests/pending/:masterId
    fastify.get('/pending/:masterId', async (request, reply) => {
        if (!(await canActAsMaster(request, request.params.masterId))) return deny(reply);
        return prisma.orderRequest.findMany({
            where: { requested_to: request.params.masterId, status: 'pending' },
            include: {
                requester: { select: { id: true, full_name: true, phone: true, commission_percentage: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/order-requests/pending-count/:masterId
    fastify.get('/pending-count/:masterId', async (request, reply) => {
        if (!(await canActAsMaster(request, request.params.masterId))) return deny(reply);
        const count = await prisma.orderRequest.count({
            where: { requested_to: request.params.masterId, status: 'pending' }
        });
        return { count };
    });

    // GET /api/order-requests/by-auxiliary/:auxiliaryId
    fastify.get('/by-auxiliary/:auxiliaryId', async (request, reply) => {
        if (!(await canAccessMechanic(await loadActor(request), request.params.auxiliaryId, request.workspace.id))) return deny(reply);
        return prisma.orderRequest.findMany({
            where: { requested_by: request.params.auxiliaryId },
            include: {
                approver: { select: { id: true, full_name: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/order-requests/auxiliaries/:masterId
    fastify.get('/auxiliaries/:masterId', async (request, reply) => {
        const masterId = request.params.masterId;
        if (!(await canActAsMaster(request, masterId))) return deny(reply);

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
    fastify.post('/', async (request, reply) => {
        const actor = await loadActor(request);
        // El solicitante siempre es quien llama (no se puede pedir "en nombre de" otro).
        const requestedTo = request.body?.requested_to;
        const target = requestedTo ? await unscoped(() => prisma.membership.findUnique({
            where: { workspace_id_profile_id: { workspace_id: request.workspace.id, profile_id: requestedTo } },
            include: { profile: true },
        })) : null;
        if (!target) return reply.status(400).send({ error: 'El maestro indicado no existe en este taller.' });
        const targetRole = normalizeRole(target.role, target.profile);
        if (!(isAdminRole(targetRole) || targetRole === 'maestro')) {
            return reply.status(400).send({ error: 'La solicitud debe dirigirse a un maestro o administrador.' });
        }
        return prisma.orderRequest.create({
            data: {
                requested_by: actor.id,
                requested_to: requestedTo,
                order_data: request.body.order_data || null,
                status: 'pending'
            }
        });
    });

    // Solo la persona a quien va dirigida (o el admin/dueño) puede responder, y una sola vez.
    async function loadRespondable(request, reply) {
        const actor = await loadActor(request);
        const row = await prisma.orderRequest.findUnique({ where: { id: request.params.id } });
        if (!row) { reply.status(404).send({ error: 'Solicitud no encontrada.' }); return null; }
        if (!(isAdminRole(actor.role) || row.requested_to === actor.id)) { deny(reply); return null; }
        if (row.status !== 'pending') { reply.status(409).send({ error: 'Esta solicitud ya fue respondida.' }); return null; }
        return row;
    }

    // PUT /api/order-requests/:id/approve
    fastify.put('/:id/approve', async (request, reply) => {
        const row = await loadRespondable(request, reply);
        if (!row) return;
        if (request.body?.created_order_id) {
            const ord = await prisma.order.findUnique({ where: { id: request.body?.created_order_id }, select: { id: true } });
            if (!ord) return reply.status(400).send({ error: 'La orden indicada no existe en este taller.' });
        }
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
    fastify.put('/:id/reject', async (request, reply) => {
        const row = await loadRespondable(request, reply);
        if (!row) return;
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
