import { Router } from 'express';

export default function ordersRouter(prisma) {
    const router = Router();

    // GET /orders?session_id=xxx&status=pending — lista de pedidos
    router.get('/', async (req, res) => {
        try {
            const { session_id, status } = req.query;
            const where = {};
            if (session_id) where.session_id = session_id;
            if (status) where.status = status;

            const orders = await prisma.order.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: 100,
                include: {
                    customer: { select: { name: true, phone: true } },
                },
            });

            res.json(orders);
        } catch (err) {
            console.error('Error listing orders:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /orders/:id — detalle de pedido
    router.get('/:id', async (req, res) => {
        try {
            const order = await prisma.order.findUnique({
                where: { id: req.params.id },
                include: {
                    customer: true,
                    session: { select: { session_name: true } },
                },
            });

            if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
            res.json(order);
        } catch (err) {
            console.error('Error getting order:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PATCH /orders/:id — actualizar estado del pedido
    router.patch('/:id', async (req, res) => {
        try {
            const { status, notes } = req.body;
            const validStatuses = ['pending', 'confirmed', 'delivered', 'cancelled'];

            if (status && !validStatuses.includes(status)) {
                return res.status(400).json({ error: `Estado inválido. Opciones: ${validStatuses.join(', ')}` });
            }

            const order = await prisma.order.update({
                where: { id: req.params.id },
                data: {
                    ...(status && { status }),
                    ...(notes !== undefined && { notes }),
                },
            });
            res.json(order);
        } catch (err) {
            console.error('Error updating order:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
