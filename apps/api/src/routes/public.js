import prisma from '../lib/prisma.js';

// ID fijo del workspace de Moto Partes VC — env var preferred, hardcoded fallback
const WORKSPACE_ID = process.env.LANDING_VC_WORKSPACE_ID || 'c4bca2c8-1ca2-49c0-a084-8b677439c731';
const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

// Horario de atencion de la cita en linea. Chiapas = CST (UTC-6), sin horario de
// verano desde 2022. Los horarios son los mismos que ofrece el formulario de la landing.
const TZ_OFFSET = '-06:00';
const TZ = 'America/Mexico_City';
const SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
// Cuantas citas simultaneas aguanta el taller en una misma hora (mecanicos disponibles).
const SLOT_CAPACITY = Math.max(1, parseInt(process.env.APPT_SLOT_CAPACITY || '2', 10) || 2);
const MAX_DAYS_AHEAD = 120;
// Estados que ocupan lugar en la agenda.
const BLOCKING_STATUSES = ['scheduled', 'pending_external', 'confirmed'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// In-memory rate limiter: max N appointment requests per phone per 24h (anti-spam;
// holgado para que el dueño pueda probar el formulario con su propio numero).
const PHONE_DAILY_LIMIT = parseInt(process.env.APPT_PHONE_DAILY_LIMIT || '6', 10) || 6;
const phoneRateMap = new Map();
function isRateLimited(phone) {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    const entry = phoneRateMap.get(phone) || { count: 0, since: now };
    if (now - entry.since > windowMs) {
        phoneRateMap.set(phone, { count: 1, since: now });
        return false;
    }
    if (entry.count >= PHONE_DAILY_LIMIT) return true;
    phoneRateMap.set(phone, { ...entry, count: entry.count + 1 });
    return false;
}
// Evita que el mapa crezca sin limite.
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, v] of phoneRateMap) if (v.since < cutoff) phoneRateMap.delete(k);
}, 60 * 60 * 1000).unref();

const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// Devuelve el Date de la hora indicada ese dia, o null si fecha/hora no son validas.
function slotDate(fecha, hora) {
    if (!DATE_RE.test(fecha || '') || !SLOTS.includes(hora)) return null;
    const d = new Date(`${fecha}T${hora}:00${TZ_OFFSET}`);
    return isNaN(d.getTime()) ? null : d;
}

// 0 = domingo, calculado sobre el dia local de Chiapas.
function isSunday(fecha) {
    return new Date(`${fecha}T12:00:00${TZ_OFFSET}`).getUTCDay() === 0;
}

// Cuantas citas activas hay por hora ese dia -> { '09:00': 1, ... }
async function bookedBySlot(fecha) {
    const start = new Date(`${fecha}T00:00:00${TZ_OFFSET}`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const rows = await prisma.appointment.findMany({
        where: {
            workspace_id: WORKSPACE_ID,
            status: { in: BLOCKING_STATUSES },
            scheduled_date: { gte: start, lt: end },
        },
        select: { scheduled_date: true },
    });
    const counts = {};
    for (const r of rows) {
        const hh = new Date(r.scheduled_date.getTime() - 6 * 3600 * 1000).toISOString().slice(11, 16);
        // Una cita a las 10:30 ocupa el bloque de las 10:00.
        const slot = `${hh.slice(0, 2)}:00`;
        counts[slot] = (counts[slot] || 0) + 1;
    }
    return counts;
}

function fmtHora(hora) {
    const [h, m] = hora.split(':');
    const hh = parseInt(h, 10);
    const suf = hh < 12 ? 'am' : 'pm';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${m} ${suf}`;
}

// Envía WhatsApp de confirmación al cliente (no bloquea la respuesta)
async function sendConfirmationWA(workspaceId, phone, nombre, fecha, hora, servicio, moto) {
    try {
        const session = await prisma.whatsappSession.findFirst({
            where: { workspace_id: workspaceId, is_connected: true },
        });
        if (!session?.mechanic_id) return;

        const fechaFmt = new Date(`${fecha}T12:00:00${TZ_OFFSET}`).toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
        });
        const motoLine = moto ? `\n🏍️ *Moto:* ${moto}` : '';

        const message =
            `¡Hola ${nombre}! ✅\n\n` +
            `Tu solicitud de cita en *Moto Partes* fue recibida.\n\n` +
            `📅 *Fecha:* ${fechaFmt}\n` +
            `⏰ *Hora:* ${fmtHora(hora)}\n` +
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
    // GET /api/public/appointments/availability?fecha=YYYY-MM-DD
    // Horas disponibles de ese dia, para que el formulario no ofrezca horarios llenos.
    fastify.get('/appointments/availability', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const fecha = String(request.query?.fecha || '');
        if (!DATE_RE.test(fecha) || isNaN(new Date(`${fecha}T12:00:00${TZ_OFFSET}`).getTime()))
            return reply.code(400).send({ error: 'Fecha inválida.' });
        if (isSunday(fecha))
            return reply.send({ fecha, closed: true, slots: SLOTS.map(h => ({ hora: h, available: false })) });

        const booked = await bookedBySlot(fecha);
        const now = Date.now();
        return reply.send({
            fecha,
            closed: false,
            slots: SLOTS.map(h => ({
                hora: h,
                available: slotDate(fecha, h).getTime() > now + 60 * 60 * 1000
                    && (booked[h] || 0) < SLOT_CAPACITY,
            })),
        });
    });

    // POST /api/public/appointments — sin autenticación, desde la landing vc.motopartes.cloud
    fastify.post('/appointments', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const body = request.body || {};
        const nombre = clean(body.nombre, 80);
        const servicio = clean(body.tipo_servicio, 120);
        const notas = typeof body.notas === 'string' ? body.notas.trim().slice(0, 1000) : '';
        const marca = clean(body.moto_marca, 40);
        const modelo = clean(body.moto_modelo, 60);
        const anio = clean(String(body.moto_anio ?? ''), 4);
        const fecha = clean(body.fecha, 10);
        const hora = clean(body.hora, 5);

        if (!nombre)
            return reply.code(400).send({ error: 'El nombre es obligatorio.' });
        const phone = String(body.telefono || '').replace(/\D/g, '');
        if (!/^\d{10}$/.test(phone))
            return reply.code(400).send({ error: 'Teléfono inválido — debe tener 10 dígitos.' });
        if (!fecha || !hora)
            return reply.code(400).send({ error: 'Fecha y hora son obligatorias.' });
        if (!servicio)
            return reply.code(400).send({ error: 'El tipo de servicio es obligatorio.' });
        if (anio && !/^\d{4}$/.test(anio))
            return reply.code(400).send({ error: 'El año de la moto no es válido.' });

        const scheduledDate = slotDate(fecha, hora);
        if (!scheduledDate)
            return reply.code(400).send({ error: 'Fecha u hora inválida.' });
        if (isSunday(fecha))
            return reply.code(400).send({ error: 'No atendemos domingos. Elige otro día.' });
        const now = Date.now();
        if (scheduledDate.getTime() < now + 60 * 60 * 1000)
            return reply.code(400).send({ error: 'Elige una fecha y hora futuras.' });
        if (scheduledDate.getTime() > now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000)
            return reply.code(400).send({ error: 'Solo puedes agendar con hasta 4 meses de anticipación.' });

        if (!WORKSPACE_ID) {
            return reply.code(503).send({ error: 'Servicio de citas no disponible temporalmente.' });
        }

        // Horario lleno (alguien lo tomó mientras llenabas el formulario).
        const booked = await bookedBySlot(fecha);
        if ((booked[hora] || 0) >= SLOT_CAPACITY)
            return reply.code(409).send({ error: 'Ese horario ya se ocupó. Elige otra hora, por favor.' });

        if (isRateLimited(phone)) {
            return reply.code(429).send({ error: 'Demasiadas solicitudes. Intenta mañana.' });
        }

        const moto = [marca, modelo, anio].filter(Boolean).join(' ');

        // El cliente puede estar guardado con o sin lada.
        const existingClient = await prisma.client.findFirst({
            where: {
                workspace_id: WORKSPACE_ID,
                phone: { in: [phone, `52${phone}`, `+52${phone}`, `521${phone}`] },
            },
        });

        const created = await prisma.appointment.create({
            data: {
                workspace_id: WORKSPACE_ID,
                client_id: existingClient?.id || null,
                scheduled_date: scheduledDate,
                service_type: servicio,
                notes: notas || null,
                moto_label: moto || null,
                status: 'pending_external',
                source: 'external',
                // Siempre guardamos nombre y telefono capturados: el cliente puede
                // llamarse distinto en el perfil y el telefono es el que se confirma.
                client_phone: phone,
                client_name_ext: nombre,
            },
        });

        // Enviar confirmación por WhatsApp al cliente (async, no bloquea)
        sendConfirmationWA(WORKSPACE_ID, phone, nombre, fecha, hora, servicio, moto);

        return reply.code(201).send({
            success: true,
            id: created.id,
            message: '¡Cita solicitada! Te enviaremos confirmación por WhatsApp. 📱',
        });
    });
}
