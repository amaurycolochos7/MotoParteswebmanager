import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { computeOrderFinance, computeCommission, nextCommissionStatus } from '../lib/payments.js';

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ELIHU 14: solo maestro/dueño puede tocar comisión.
function canManageCommission(request) {
    if (['owner', 'admin', 'mechanic'].includes(request.workspaceRole)) return true;
    return (request.workspacePermissions || {}).can_manage_payments === true;
}

export default async function earningsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // POST /api/earnings - Record earning
    fastify.post('/', async (request) => {
        const { order_id, mechanic_id, labor_amount, supervisor_id } = request.body;
        const mechanic = await prisma.profile.findUnique({
            where: { id: mechanic_id },
            select: { commission_percentage: true }
        });
        const rate = Number(mechanic?.commission_percentage || 0);
        const earned = (Number(labor_amount) * rate) / 100;

        return prisma.mechanicEarning.create({
            data: {
                order_id,
                mechanic_id,
                labor_amount: Number(labor_amount),
                commission_rate: rate,
                earned_amount: earned,
                week_start: getWeekStart(new Date()),
            }
        });
    });

    // GET /api/earnings?mechanicId=&startDate=&endDate=
    fastify.get('/', async (request) => {
        const { mechanicId, startDate, endDate } = request.query;
        // Defensa en profundidad: filtramos por workspace_id explícitamente
        // además de la auto-scope extension de Prisma.
        const where = { workspace_id: request.workspace.id };
        if (mechanicId) where.mechanic_id = mechanicId;
        if (startDate) where.created_at = { ...(where.created_at || {}), gte: new Date(startDate) };
        if (endDate) where.created_at = { ...(where.created_at || {}), lte: new Date(endDate) };

        return prisma.mechanicEarning.findMany({
            where,
            include: { order: { select: { order_number: true, client: { select: { full_name: true } } } } },
            orderBy: { created_at: 'desc' }
        });
    });

    // PUT /api/earnings/mark-paid
    fastify.put('/mark-paid', async (request) => {
        const { earningIds } = request.body;
        await prisma.mechanicEarning.updateMany({
            where: { id: { in: earningIds } },
            data: { is_paid: true, paid_at: new Date() }
        });
        return { success: true };
    });

    // GET /api/earnings/weekly/:mechanicId
    fastify.get('/weekly/:mechanicId', async (request) => {
        const weekStart = getWeekStart(new Date());
        return prisma.mechanicEarning.findMany({
            where: {
                mechanic_id: request.params.mechanicId,
                week_start: weekStart
            },
            include: { order: { select: { order_number: true } } }
        });
    });

    // GET /api/earnings/order/:orderId — comisión variable + estado para una orden.
    fastify.get('/order/:orderId', async (request, reply) => {
        const { orderId } = request.params;
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
        const earnings = await prisma.mechanicEarning.findMany({
            where: { order_id: orderId },
            include: { mechanic: { select: { id: true, full_name: true } } },
        });
        const payments = await prisma.orderPayment.findMany({ where: { order_id: orderId } });
        const finance = computeOrderFinance(order, payments);
        return {
            labor_total: Number(order.labor_total) || 0,
            finance,
            earnings: earnings.map((e) => ({
                id: e.id,
                mechanic_id: e.mechanic_id,
                mechanic_name: e.mechanic?.full_name || null,
                commission_rate: Number(e.commission_rate),
                commission_base: Number(e.labor_amount),
                commission_amount: Number(e.earned_amount),
                commission_status: e.commission_status,
                commission_released_at: e.commission_released_at,
                is_paid: e.is_paid,
            })),
        };
    });

    // PUT /api/earnings/order/:orderId/commission — fija % variable sobre mano de obra.
    // Crea/actualiza la comisión del mecánico de la orden. La comisión queda
    // PENDING_PAYMENT y solo se libera (READY_TO_PAY) cuando el saldo llega a 0.
    fastify.put('/order/:orderId/commission', async (request, reply) => {
        if (!canManageCommission(request)) {
            return reply.status(403).send({ error: 'No tienes permiso para cambiar la comisión.' });
        }
        const { orderId } = request.params;
        const { commission_rate } = request.body || {};
        const rate = Number(commission_rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
            return reply.status(400).send({ error: 'El porcentaje de comisión debe estar entre 0 y 100.' });
        }
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
        const mechanicId = order.mechanic_id;
        if (!mechanicId) return reply.status(400).send({ error: 'La orden no tiene mecánico asignado.' });

        const { base, amount } = computeCommission(order.labor_total, rate);
        const payments = await prisma.orderPayment.findMany({ where: { order_id: orderId } });
        const finance = computeOrderFinance(order, payments);

        const existing = await prisma.mechanicEarning.findFirst({
            where: { order_id: orderId, mechanic_id: mechanicId },
        });
        // Comisión ya pagada no se reabre desde aquí.
        const currentStatus = existing?.commission_status === 'PAID' ? 'PAID' : 'PENDING_PAYMENT';
        const status = nextCommissionStatus(currentStatus, finance);

        let earning;
        if (existing) {
            earning = await prisma.mechanicEarning.update({
                where: { id: existing.id },
                data: {
                    labor_amount: base,
                    commission_rate: rate,
                    earned_amount: amount,
                    commission_status: status,
                    commission_released_at: status === 'READY_TO_PAY' ? (existing.commission_released_at || new Date()) : (status === 'PENDING_PAYMENT' ? null : existing.commission_released_at),
                },
            });
        } else {
            earning = await prisma.mechanicEarning.create({
                data: {
                    order_id: orderId,
                    mechanic_id: mechanicId,
                    labor_amount: base,
                    commission_rate: rate,
                    earned_amount: amount,
                    commission_status: status,
                    commission_released_at: status === 'READY_TO_PAY' ? new Date() : null,
                    week_start: getWeekStart(new Date()),
                },
            });
        }
        return { earning, finance };
    });
}
