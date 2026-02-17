import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function statsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/stats/dashboard
    fastify.get('/dashboard', async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        const [todayOrders, activeOrders, monthOrders] = await Promise.all([
            prisma.order.count({ where: { created_at: { gte: today } } }),
            prisma.order.count({ where: { is_paid: false } }),
            prisma.order.findMany({
                where: { is_paid: true, paid_at: { gte: monthAgo } },
                select: { total_amount: true }
            })
        ]);

        const monthRevenue = monthOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

        return { todayOrders, activeOrders, monthRevenue };
    });

    // GET /api/stats/mechanics
    fastify.get('/mechanics', async (request) => {
        const { startDate, endDate } = request.query;
        const where = { is_paid: true };
        if (startDate) where.created_at = { ...(where.created_at || {}), gte: new Date(startDate) };
        if (endDate) where.created_at = { ...(where.created_at || {}), lte: new Date(endDate) };

        const orders = await prisma.order.findMany({
            where,
            include: {
                mechanic: { select: { id: true, full_name: true, commission_percentage: true } }
            }
        });

        const grouped = {};
        orders.forEach(order => {
            if (!order.mechanic) return;
            const id = order.mechanic.id;
            if (!grouped[id]) {
                grouped[id] = {
                    id,
                    name: order.mechanic.full_name,
                    commission_percentage: Number(order.mechanic.commission_percentage),
                    orders_count: 0,
                    total_labor: 0,
                    total_commission: 0
                };
            }
            grouped[id].orders_count++;
            const labor = Number(order.labor_total) || 0;
            grouped[id].total_labor += labor;
            grouped[id].total_commission += labor * (Number(order.mechanic.commission_percentage) / 100);
        });

        return Object.values(grouped);
    });
}
