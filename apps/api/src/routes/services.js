import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

// Only allow known Service model fields
function sanitizeServiceData(body) {
    const allowed = ['name', 'description', 'base_price', 'labor_cost', 'materials_cost', 'category', 'is_active', 'display_order'];
    const data = {};
    for (const key of allowed) {
        if (body[key] !== undefined) {
            // Convert numeric fields to proper types
            if (['base_price', 'labor_cost', 'materials_cost'].includes(key)) {
                data[key] = parseFloat(body[key]) || 0;
            } else if (key === 'display_order') {
                data[key] = parseInt(body[key]) || 0;
            } else {
                data[key] = body[key];
            }
        }
    }
    return data;
}

export default async function servicesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    fastify.get('/', async () => {
        return prisma.service.findMany({ orderBy: { display_order: 'asc' } });
    });

    fastify.post('/', async (request) => {
        const data = sanitizeServiceData(request.body);
        return prisma.service.create({ data });
    });

    fastify.put('/:id', async (request) => {
        const data = sanitizeServiceData(request.body);
        return prisma.service.update({
            where: { id: request.params.id },
            data
        });
    });

    fastify.delete('/:id', async (request) => {
        await prisma.service.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}
