import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { fireEvent } from '../lib/events.js';
import {
    computeOrderFinance,
    validateNewPayment,
    normalizePaymentMethod,
    nextCommissionStatus,
    money,
} from '../lib/payments.js';

// Who may touch money? ELIHU 14: the auxiliary can create orders but must NOT
// register/edit/cancel payments nor mark as paid. Owner/admin/master-mechanic
// can. An explicit membership permission override (can_manage_payments) wins.
// Role 'mechanic' in this workspace model is the MASTER; auxiliaries are
// role 'auxiliary'.
function canManagePayments(request) {
    if (['owner', 'admin', 'mechanic'].includes(request.workspaceRole)) return true;
    return (request.workspacePermissions || {}).can_manage_payments === true;
}

// Recompute order payment state from non-cancelled payments and propagate:
//   - order.is_paid / paid_at
//   - commission release on full liquidation (only PENDING_PAYMENT earnings)
// Runs inside the caller's transaction.
async function reconcileOrder(tx, orderId) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return null;
    const payments = await tx.orderPayment.findMany({ where: { order_id: orderId } });
    const finance = computeOrderFinance(order, payments);

    await tx.order.update({
        where: { id: orderId },
        data: {
            is_paid: finance.is_fully_paid,
            paid_at: finance.is_fully_paid ? (order.paid_at || new Date()) : null,
        },
    });

    // Commission lifecycle: release only when fully paid; never downgrade PAID.
    const earnings = await tx.mechanicEarning.findMany({ where: { order_id: orderId } });
    for (const e of earnings) {
        const next = nextCommissionStatus(e.commission_status, finance);
        if (next !== e.commission_status) {
            await tx.mechanicEarning.update({
                where: { id: e.id },
                data: {
                    commission_status: next,
                    commission_released_at: next === 'READY_TO_PAY' ? new Date() : (next === 'PENDING_PAYMENT' ? null : e.commission_released_at),
                },
            });
        }
    }
    return finance;
}

export default async function orderPaymentsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/order-payments/order/:orderId — lista de abonos + resumen.
    // Lectura: cualquier miembro del workspace.
    fastify.get('/order/:orderId', async (request, reply) => {
        const { orderId } = request.params;
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
        const payments = await prisma.orderPayment.findMany({
            where: { order_id: orderId },
            orderBy: { payment_date: 'asc' },
        });
        return { finance: computeOrderFinance(order, payments), payments };
    });

    // POST /api/order-payments — registrar un abono.
    fastify.post('/', async (request, reply) => {
        if (!canManagePayments(request)) {
            return reply.status(403).send({ error: 'No tienes permiso para registrar pagos.' });
        }
        const { order_id, amount, payment_method, note, allow_overpay } = request.body || {};
        if (!order_id) return reply.status(400).send({ error: 'order_id es obligatorio' });

        const order = await prisma.order.findUnique({ where: { id: order_id } });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });

        // Overpago solo lo autoriza owner/admin explícitamente.
        const allowOverpay = allow_overpay === true && ['owner', 'admin'].includes(request.workspaceRole);

        const existing = await prisma.orderPayment.findMany({ where: { order_id } });
        const finance = computeOrderFinance(order, existing);
        const check = validateNewPayment(amount, finance.balance, { allowOverpay });
        if (!check.ok) return reply.status(400).send({ error: check.error });

        const result = await prisma.$transaction(async (tx) => {
            const payment = await tx.orderPayment.create({
                data: {
                    order_id,
                    amount: check.amount,
                    payment_method: normalizePaymentMethod(payment_method),
                    note: note || null,
                    received_by: request.user.id,
                    created_by: request.user.id,
                },
            });
            const newFinance = await reconcileOrder(tx, order_id);
            return { payment, finance: newFinance };
        });

        fireEvent('order.payment_registered', {
            workspaceId: request.workspace.id,
            order_id,
            amount: money(check.amount),
            is_fully_paid: result.finance?.is_fully_paid || false,
        });
        return reply.status(201).send(result);
    });

    // POST /api/order-payments/:id/cancel — cancelar un abono (auditoría, no borra).
    fastify.post('/:id/cancel', async (request, reply) => {
        if (!canManagePayments(request)) {
            return reply.status(403).send({ error: 'No tienes permiso para cancelar pagos.' });
        }
        const { id } = request.params;
        const { reason } = request.body || {};
        const payment = await prisma.orderPayment.findUnique({ where: { id } });
        if (!payment) return reply.status(404).send({ error: 'Pago no encontrado' });
        if (payment.cancelled_at) return reply.status(409).send({ error: 'El pago ya está cancelado' });

        const result = await prisma.$transaction(async (tx) => {
            await tx.orderPayment.update({
                where: { id },
                data: {
                    cancelled_at: new Date(),
                    cancelled_by: request.user.id,
                    cancellation_reason: reason || 'Sin motivo especificado',
                },
            });
            const finance = await reconcileOrder(tx, payment.order_id);
            return { finance };
        });
        return result;
    });

    // GET /api/order-payments/:id/receipt — datos del comprobante de un abono.
    fastify.get('/:id/receipt', async (request, reply) => {
        const { id } = request.params;
        const payment = await prisma.orderPayment.findUnique({ where: { id } });
        if (!payment) return reply.status(404).send({ error: 'Pago no encontrado' });
        const order = await prisma.order.findUnique({
            where: { id: payment.order_id },
            include: { client: true, motorcycle: true },
        });
        const payments = await prisma.orderPayment.findMany({ where: { order_id: payment.order_id } });
        const finance = computeOrderFinance(order, payments);
        return {
            receipt_number: payment.receipt_number,
            workshop: request.workspace?.name || 'Taller',
            client: order?.client ? { name: order.client.full_name, phone: order.client.phone } : null,
            motorcycle: order?.motorcycle
                ? `${order.motorcycle.brand} ${order.motorcycle.model}${order.motorcycle.plates ? ' · ' + order.motorcycle.plates : ''}`
                : null,
            order_number: order?.order_number,
            payment_date: payment.payment_date,
            payment_method: payment.payment_method,
            amount: payment.amount,
            order_total: finance.total,
            total_paid: finance.paid,
            balance: finance.balance,
            payment_status: finance.payment_status,
            received_by: payment.received_by,
            note: payment.note,
            cancelled: !!payment.cancelled_at,
        };
    });
}
