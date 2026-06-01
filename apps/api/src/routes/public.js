import prisma from '../lib/prisma.js';

const WORKSPACE_ID = process.env.LANDING_VC_WORKSPACE_ID || null;

// In-memory rate limiter: max 3 appointment requests per phone per 24h.
const phoneRateMap = new Map();
function isRateLimited(phone) {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    const entry = phoneRateMap.get(phone) || { count: 0, since: now };
    if (now - entry.since > windowMs) {
        phoneRateMap.set(phone, { count: 1, since: now });
        return false;
    }
    if (entry.count >= 3) return true;
    phoneRateMap.set(phone, { ...entry, count: entry.count + 1 });
    return false;
}

export default async function publicRoutes(fastify) {
    // POST /api/public/appointments — sin autenticación, desde la landing vc.motopartes.cloud
    fastify.post('/appointments', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { nombre, telefono, fecha, hora, tipo_servicio, notas } = request.body || {};

        if (!nombre?.trim())
            return reply.code(400).send({ error: 'El nombre es obligatorio.' });
        const phone = (telefono || '').replace(/\D/g, '');
        if (!/^\d{10}$/.test(phone))
            return reply.code(400).send({ error: 'Teléfono inválido — debe tener 10 dígitos.' });
        if (!fecha || !hora)
            return reply.code(400).send({ error: 'Fecha y hora son obligatorias.' });
        if (!tipo_servicio)
            return reply.code(400).send({ error: 'El tipo de servicio es obligatorio.' });

        if (!WORKSPACE_ID) {
            return reply.code(503).send({ error: 'Servicio de citas no disponible temporalmente.' });
        }

        if (isRateLimited(phone)) {
            return reply.code(429).send({ error: 'Demasiadas solicitudes. Intenta mañana.' });
        }

        const scheduledDate = new Date(`${fecha}T${hora}:00`);
        if (isNaN(scheduledDate.getTime()))
            return reply.code(400).send({ error: 'Fecha u hora inválida.' });

        // Busca cliente existente por teléfono en el workspace para linkear si ya existe
        const existingClient = await prisma.client.findFirst({
            where: { workspace_id: WORKSPACE_ID, phone },
        });

        await prisma.appointment.create({
            data: {
                workspace_id: WORKSPACE_ID,
                client_id: existingClient?.id || null,
                scheduled_date: scheduledDate,
                service_type: tipo_servicio,
                notes: notas || null,
                status: 'pending_external',
                source: 'external',
                client_phone: existingClient ? null : phone,
                client_name_ext: existingClient ? null : nombre.trim(),
            },
        });

        return reply.code(201).send({
            success: true,
            message: '¡Cita solicitada! Te confirmaremos vía WhatsApp en breve. 📱',
        });
    });
}
