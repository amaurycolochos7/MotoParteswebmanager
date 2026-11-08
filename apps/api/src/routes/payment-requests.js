import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loadActor, canAccessMechanic, isAdminRole } from '../lib/permissions.js';

const deny = (reply, msg = 'No tienes permiso para esta acción.') => reply.status(403).send({ error: msg });

export default async function paymentRequestsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // POST /api/payment-requests
    fastify.post('/', async (request, reply) => {
        // V2: solo owner/admin/maestro piden pagos, siempre sobre auxiliares de su alcance y con comisiones de ESE auxiliar.
        const actor = await loadActor(request);
        if (!(isAdminRole(actor.role) || actor.role === 'maestro')) return deny(reply);
        const { auxiliary_id, total_amount, earning_ids, order_details, notes } = request.body || {};
        const master_id = isAdminRole(actor.role) ? (request.body?.master_id || actor.id) : actor.id;
        if (!(await canAccessMechanic(actor, auxiliary_id, request.workspace.id)) || auxiliary_id === actor.id) {
            return deny(reply, 'Ese integrante no está dentro de tu alcance.');
        }
        if (earning_ids && earning_ids.length > 0) {
            const mine = await prisma.mechanicEarning.count({ where: { id: { in: earning_ids }, mechanic_id: auxiliary_id } });
            if (mine !== earning_ids.length) return reply.status(400).send({ error: 'Alguna comisión no pertenece a ese auxiliar.' });
        }

        const payment = await prisma.paymentRequest.create({
            data: {
                master_id,
                auxiliary_id,
                total_amount: Number(total_amount),
                earning_ids: earning_ids || [],
                order_details: order_details || [],
                notes: notes || null,
                status: 'pending'
            }
        });

        // Link earnings to this payment
        if (earning_ids && earning_ids.length > 0) {
            await prisma.mechanicEarning.updateMany({
                where: { id: { in: earning_ids } },
                data: { payment_request_id: payment.id }
            });
        }

        return payment;
    });

    // PUT /api/payment-requests/:id/accept
    fastify.put('/:id/accept', async (request, reply) => {
        const actor = await loadActor(request);
        const row = await prisma.paymentRequest.findUnique({ where: { id: request.params.id } });
        if (!row) return reply.status(404).send({ error: 'Solicitud de pago no encontrada.' });
        // Solo quien recibe el pago (o el admin) la acepta, y una sola vez.
        if (!(isAdminRole(actor.role) || row.auxiliary_id === actor.id)) return deny(reply);
        if (row.status !== 'pending') return reply.status(409).send({ error: 'Esta solicitud ya fue respondida.' });
        const payment = await prisma.paymentRequest.update({
            where: { id: request.params.id },
            data: { status: 'accepted', accepted_at: new Date() }
        });

        // Mark linked earnings as paid
        const earningIds = payment.earning_ids || [];
        if (earningIds.length > 0) {
            await prisma.mechanicEarning.updateMany({
                where: { id: { in: earningIds } },
                data: { is_paid: true, paid_at: new Date(), commission_status: 'PAID' }
            });
        }

        return payment;
    });

    // GET /api/payment-requests/pending/:auxiliaryId
    fastify.get('/pending/:auxiliaryId', async (request, reply) => {
        if (!(await canAccessMechanic(await loadActor(request), request.params.auxiliaryId, request.workspace.id))) return deny(reply);
        return prisma.paymentRequest.findMany({
            where: { auxiliary_id: request.params.auxiliaryId, status: 'pending' },
            include: { master: { select: { id: true, full_name: true } } },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/payment-requests/pending-count/:auxiliaryId
    fastify.get('/pending-count/:auxiliaryId', async (request, reply) => {
        if (!(await canAccessMechanic(await loadActor(request), request.params.auxiliaryId, request.workspace.id))) return deny(reply);
        const count = await prisma.paymentRequest.count({
            where: { auxiliary_id: request.params.auxiliaryId, status: 'pending' }
        });
        return { count };
    });

    // GET /api/payment-requests/history/:userId
    fastify.get('/history/:userId', async (request, reply) => {
        const userId = request.params.userId;
        if (!(await canAccessMechanic(await loadActor(request), userId, request.workspace.id))) return deny(reply);
        return prisma.paymentRequest.findMany({
            where: { OR: [{ master_id: userId }, { auxiliary_id: userId }] },
            include: {
                master: { select: { id: true, full_name: true } },
                auxiliary: { select: { id: true, full_name: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    });
}
