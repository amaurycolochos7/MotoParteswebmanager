import { Router } from 'express';

export default function customersRouter(prisma) {
    const router = Router();

    // GET /customers?session_id=xxx — lista de clientes
    router.get('/', async (req, res) => {
        try {
            const { session_id } = req.query;
            const where = session_id ? { session_id } : {};

            const customers = await prisma.customer.findMany({
                where,
                orderBy: { updated_at: 'desc' },
                include: {
                    _count: { select: { orders: true } },
                },
            });

            res.json(customers);
        } catch (err) {
            console.error('Error listing customers:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // GET /customers/:id — detalle de un cliente con pedidos
    router.get('/:id', async (req, res) => {
        try {
            const customer = await prisma.customer.findUnique({
                where: { id: req.params.id },
                include: {
                    orders: { orderBy: { created_at: 'desc' }, take: 20 },
                    session: { select: { session_name: true } },
                },
            });

            if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
            res.json(customer);
        } catch (err) {
            console.error('Error getting customer:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // PATCH /customers/:id — actualizar notas del cliente
    router.patch('/:id', async (req, res) => {
        try {
            const { name, notes } = req.body;
            const customer = await prisma.customer.update({
                where: { id: req.params.id },
                data: { ...(name !== undefined && { name }), ...(notes !== undefined && { notes }) },
            });
            res.json(customer);
        } catch (err) {
            console.error('Error updating customer:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
