import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { fireEvent } from '../lib/events.js';
import {
    computeOrderFinance,
    validateNewPayment,
    normalizePaymentMethod,
    money,
} from '../lib/payments.js';
import { syncOrderEarnings, applyCommissionStatuses } from '../lib/commissions.js';
import { guardOrder } from '../lib/visibility.js';

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

    // Una orden cobrada por abonos puede no tener todavía su comisión (solo se creaba al marcarla pagada por otra ruta):
    // se crea aquí con su mano de obra y enseguida se libera si ya quedó liquidada.
    await syncOrderEarnings(tx, { orderId, workspaceId: order.workspace_id, mechanicId: order.mechanic_id, laborTotal: order.labor_total });

    // Ciclo de la comisión: se libera solo cuando el cliente liquida todo (y queda pagada si el mecánico es el dueño/administrador).
    await applyCommissionStatuses(tx, order, finance);
    return finance;
}

export default async function orderPaymentsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);
    // Solo quien tiene la orden (o dueño/administrador) puede ver o registrar sus pagos. El id puede ser el de la orden o el de un pago.
    fastify.addHook('preHandler', guardOrder(async (r) => {
        if (r.params?.orderId) return r.params.orderId;
        if (r.body?.order_id) return r.body.order_id;
        if (r.params?.id) {
            const p = await prisma.orderPayment.findFirst({ where: { id: r.params.id }, select: { order_id: true } });
            return p?.order_id || null;
        }
        return null;
    }));

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
