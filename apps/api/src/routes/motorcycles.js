import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { summarizeHistory } from '../lib/client-lookup.js';

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
    fastify.addHook('preHandler', resolveWorkspace);

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

    // GET /api/motorcycles/:id/history — linea de tiempo de servicios de una moto.
    // Ordenes (mas recientes primero) con servicios, refacciones, mecanico y totales,
    // mas un resumen. Solo cuentan como "servicios hechos" las ordenes en estado terminal.
    fastify.get('/:id/history', async (request, reply) => {
        const moto = await prisma.motorcycle.findUnique({
            where: { id: request.params.id },
            include: { client: { select: { id: true, full_name: true, phone: true, preferred_mechanic_id: true } } },
        });
        if (!moto) return reply.status(404).send({ error: 'Moto no encontrada' });

        const orders = await prisma.order.findMany({
            where: { motorcycle_id: moto.id },
            include: {
                status: { select: { name: true, is_terminal: true, color: true } },
                mechanic: { select: { id: true, full_name: true } },
                services: { orderBy: { created_at: 'asc' } },
                parts: { orderBy: { created_at: 'asc' } },
            },
            orderBy: { created_at: 'desc' },
            take: 200,
        });

        return {
            motorcycle: {
                id: moto.id, brand: moto.brand, model: moto.model, year: moto.year,
                plates: moto.plates, color: moto.color, mileage: moto.mileage,
            },
            client: moto.client,
            summary: summarizeHistory(orders),
            timeline: orders.map((o) => ({
                id: o.id,
                order_number: o.order_number,
                date: o.completed_at || o.created_at,
                created_at: o.created_at,
                completed_at: o.completed_at,
                status: o.status ? { name: o.status.name, is_terminal: o.status.is_terminal, color: o.status.color } : null,
                mechanic: o.mechanic ? { id: o.mechanic.id, full_name: o.mechanic.full_name } : null,
                services: o.services.map((s) => ({ name: s.name, quantity: s.quantity, price: s.price })),
                parts: o.parts.map((p) => ({ name: p.name, quantity: p.quantity, price: p.price })),
                labor_total: o.labor_total,
                parts_total: o.parts_total,
                total_amount: o.total_amount,
                is_paid: o.is_paid,
                notes: o.mechanic_notes || null,
                complaint: o.customer_complaint || null,
            })),
        };
    });

    // POST /api/motorcycles
    fastify.post('/', async (request, reply) => {
        try {
            const data = sanitizeMotoData(request.body);
            if (!data.client_id || !data.brand || !data.model) {
                return reply.status(400).send({ error: 'Cliente, marca y modelo son obligatorios.' });
            }
            // El cliente debe ser de este taller (findUnique ya filtra por workspace).
            const owner = await prisma.client.findUnique({ where: { id: data.client_id }, select: { id: true } });
            if (!owner) return reply.status(404).send({ error: 'Cliente no encontrado en este taller.' });
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
