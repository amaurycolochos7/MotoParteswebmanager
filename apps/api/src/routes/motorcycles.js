import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

// Only allow known Motorcycle model fields
function sanitizeMotoData(body) {
    const data = {};
    if (body.client_id) data.client_id = body.client_id;
    if (body.brand) data.brand = body.brand;
    if (body.model) data.model = body.model;
    if (body.year !== undefined && body.year !== '' && body.year !== null) data.year = parseInt(body.year) || null;
    if (body.plates !== undefined) data.plates = body.plates || null;
    if (body.color !== undefined) data.color = body.color || null;
    if (body.vin !== undefined) data.vin = body.vin || null;
    if (body.mileage !== undefined && body.mileage !== '' && body.mileage !== null) data.mileage = parseInt(body.mileage) || 0;
    if (body.notes !== undefined) data.notes = body.notes || null;
    return data;
}

export default async function motorcyclesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // GET /api/motorcycles?clientId=
    fastify.get('/', async (request) => {
        const { clientId } = request.query;
        if (clientId) {
            return prisma.motorcycle.findMany({
                where: { client_id: clientId },
                orderBy: { created_at: 'desc' }
            });
        }
        return prisma.motorcycle.findMany({ orderBy: { created_at: 'desc' } });
    });

    // POST /api/motorcycles
    fastify.post('/', async (request, reply) => {
        try {
            const data = sanitizeMotoData(request.body);
            return await prisma.motorcycle.create({ data });
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Error al crear motocicleta', details: error.message });
        }
    });

    // PUT /api/motorcycles/:id
    fastify.put('/:id', async (request) => {
        const data = sanitizeMotoData(request.body);
        delete data.client_id; // Don't allow changing owner via update
        return prisma.motorcycle.update({
            where: { id: request.params.id },
            data
        });
    });

    // DELETE /api/motorcycles/:id
    fastify.delete('/:id', async (request) => {
        await prisma.motorcycle.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}
