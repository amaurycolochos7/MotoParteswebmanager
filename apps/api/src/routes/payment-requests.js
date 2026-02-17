import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function paymentRequestsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // POST /api/payment-requests
    fastify.post('/', async (request) => {
        const { master_id, auxiliary_id, total_amount, earning_ids, order_details, notes } = request.body;

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
    fastify.put('/:id/accept', async (request) => {
        const payment = await prisma.paymentRequest.update({
            where: { id: request.params.id },
            data: { status: 'accepted', accepted_at: new Date() }
        });

        // Mark linked earnings as paid
        const earningIds = payment.earning_ids || [];
        if (earningIds.length > 0) {
            await prisma.mechanicEarning.updateMany({
                where: { id: { in: earningIds } },
                data: { is_paid: true, paid_at: new Date() }
            });
        }

        return payment;
    });

    // GET /api/payment-requests/pending/:auxiliaryId
    fastify.get('/pending/:auxiliaryId', async (request) => {
        return prisma.paymentRequest.findMany({
            where: { auxiliary_id: request.params.auxiliaryId, status: 'pending' },
            include: { master: { select: { id: true, full_name: true } } },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/payment-requests/pending-count/:auxiliaryId
    fastify.get('/pending-count/:auxiliaryId', async (request) => {
        const count = await prisma.paymentRequest.count({
            where: { auxiliary_id: request.params.auxiliaryId, status: 'pending' }
        });
        return { count };
    });

    // GET /api/payment-requests/history/:userId
    fastify.get('/history/:userId', async (request) => {
        const userId = request.params.userId;
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
