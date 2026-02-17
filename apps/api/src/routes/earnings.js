import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

export default async function earningsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

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
        const where = {};
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
}
