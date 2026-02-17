import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

export default async function clientsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/clients
    fastify.get('/', async () => {
        return prisma.client.findMany({
            include: { motorcycles: true },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/clients/:id
    fastify.get('/:id', async (request, reply) => {
        const client = await prisma.client.findUnique({
            where: { id: request.params.id },
            include: { motorcycles: true, orders: { include: { status: true } } }
        });
        if (!client) return reply.status(404).send({ error: 'Cliente no encontrado' });
        return client;
    });

    // GET /api/clients/phone/:phone
    fastify.get('/phone/:phone', async (request) => {
        const phone = request.params.phone.replace(/\D/g, '');
        const client = await prisma.client.findFirst({
            where: { phone: { contains: phone } },
            include: { motorcycles: true }
        });
        return client || null;
    });

    // POST /api/clients
    fastify.post('/', async (request) => {
        const data = request.body;
        return prisma.client.create({
            data: {
                phone: data.phone,
                full_name: data.full_name,
                email: data.email || null,
                notes: data.notes || null,
                created_by: request.user.id
            },
            include: { motorcycles: true }
        });
    });

    // PUT /api/clients/:id
    fastify.put('/:id', async (request) => {
        return prisma.client.update({
            where: { id: request.params.id },
            data: request.body,
            include: { motorcycles: true }
        });
    });

    // DELETE /api/clients/:id
    fastify.delete('/:id', async (request) => {
        await prisma.client.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}
