import prisma from '../lib/prisma.js';

// ID fijo del workspace de Moto Partes VC — env var preferred, hardcoded fallback
const WORKSPACE_ID = process.env.LANDING_VC_WORKSPACE_ID || 'c4bca2c8-1ca2-49c0-a084-8b677439c731';
const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

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

// Envía WhatsApp de confirmación al cliente (no bloquea la respuesta)
async function sendConfirmationWA(workspaceId, phone, nombre, fecha, hora, servicio, moto) {
    try {
        const session = await prisma.whatsappSession.findFirst({
            where: { workspace_id: workspaceId, is_connected: true },
        });
        if (!session?.mechanic_id) return;

        const fechaFmt = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
        });
        const horaFmt = hora.replace(':00', '') + (parseInt(hora) < 12 ? ' am' : ' pm');
        const motoLine = moto ? `\n🏍️ Moto: ${moto}` : '';

        const message =
            `¡Hola ${nombre}! ✅\n\n` +
            `Tu solicitud de cita en *Moto Partes* fue recibida.\n\n` +
            `📅 *Fecha:* ${fechaFmt}\n` +
            `⏰ *Hora:* ${horaFmt}\n` +
            `🔧 *Servicio:* ${servicio}` +
            motoLine +
            `\n\nEstamos revisando tu solicitud y te confirmaremos a la brevedad. ¡Gracias! 🙌`;

        await fetch(`${BOT_URL}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
            body: JSON.stringify({ mechanicId: session.mechanic_id, phone: `52${phone}`, message }),
            signal: AbortSignal.timeout(15000),
        });
    } catch (e) {
        // No bloquear la respuesta si WhatsApp falla
        console.error('[public/appt] WA send failed:', e.message);
    }
}

export default async function publicRoutes(fastify) {
    // POST /api/public/appointments — sin autenticación, desde la landing vc.motopartes.cloud
    fastify.post('/appointments', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const {
            nombre, telefono, fecha, hora, tipo_servicio, notas,
            moto_marca, moto_modelo, moto_anio,
        } = request.body || {};

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

        // Construir notas con datos de la moto
        const motoInfo = [moto_marca, moto_modelo, moto_anio].filter(Boolean).join(' ');
        const notasFull = [
            motoInfo ? `Moto: ${motoInfo}` : null,
            notas?.trim() || null,
        ].filter(Boolean).join('\n') || null;

        const existingClient = await prisma.client.findFirst({
            where: { workspace_id: WORKSPACE_ID, phone },
        });

        await prisma.appointment.create({
            data: {
                workspace_id: WORKSPACE_ID,
                client_id: existingClient?.id || null,
                scheduled_date: scheduledDate,
                service_type: tipo_servicio,
                notes: notasFull,
                status: 'pending_external',
                source: 'external',
                client_phone: existingClient ? null : phone,
                client_name_ext: existingClient ? null : nombre.trim(),
            },
        });

        // Enviar confirmación por WhatsApp al cliente (async, no bloquea)
        sendConfirmationWA(WORKSPACE_ID, phone, nombre.trim(), fecha, hora, tipo_servicio, motoInfo);

        return reply.code(201).send({
            success: true,
            message: '¡Cita solicitada! Te enviaremos confirmación por WhatsApp. 📱',
        });
    });
}
