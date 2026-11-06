import prisma from '../lib/prisma.js';
import {
    WORKSPACE_ID, FINAL_STATUSES, DATE_RE, MAPS_URL, SHOP_NAME,
    newToken, linkFor, localParts, fmtFecha, fmtHora, validateCustomerSlot, availabilityFor,
    logEvent, notifyCustomer,
} from '../lib/appointment-flow.js';

// ── Anti-spam: maximo N solicitudes por telefono cada 24 h (en memoria) ──
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
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, v] of phoneRateMap) if (v.since < cutoff) phoneRateMap.delete(k);
}, 60 * 60 * 1000).unref();

const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;

// Lo que el cliente puede ver de su cita (nunca el telefono ni datos internos).
function publicView(a) {
    const now = Date.now();
    const proposalLive = a.status === 'proposal_sent' && a.proposal_expires_at && new Date(a.proposal_expires_at).getTime() > now;
    // Si la propuesta ya paso de vigencia pero la tarea automatica aun no corrio, se muestra como vencida.
    const status = a.status === 'proposal_sent' && !proposalLive ? (a.proposal_from_confirmed ? 'confirmed' : 'expired') : a.status;
    const when = localParts(a.scheduled_date);
    const view = {
        status,
        nombre: (a.client?.full_name || a.client_name_ext || '').split(' ')[0],
        fecha: when.fecha, hora: when.hora,
        fecha_texto: fmtFecha(a.scheduled_date), hora_texto: fmtHora(a.scheduled_date),
        scheduled_iso: new Date(a.scheduled_date).toISOString(),
        servicio: a.service_type, moto: a.moto_label || null, notas: a.notes || null,
        proposal: null,
        decision_note: ['rejected', 'cancelled'].includes(a.status) ? a.decision_note || null : null,
        cancelled_by: a.status === 'cancelled' ? a.cancelled_by : null,
        shop: SHOP_NAME, maps: MAPS_URL,
    };
    if (proposalLive) {
        const p = localParts(a.proposed_date);
        view.proposal = {
            fecha: p.fecha, hora: p.hora,
            fecha_texto: fmtFecha(a.proposed_date), hora_texto: fmtHora(a.proposed_date),
            scheduled_iso: new Date(a.proposed_date).toISOString(),
            note: a.proposal_note || null,
            expires_texto: `${fmtFecha(a.proposal_expires_at)} a las ${fmtHora(a.proposal_expires_at)}`,
            from_confirmed: !!a.proposal_from_confirmed,
        };
    }
    return view;
}

export default async function publicRoutes(fastify) {
    const byToken = async (token) => {
        if (!TOKEN_RE.test(token || '')) return null;
        return prisma.appointment.findFirst({ where: { public_token: token }, include: { client: true } });
    };
    const notFound = (reply) => reply.code(404).send({ error: 'No encontramos esta cita. Revisa que el enlace esté completo.' });

    // GET /api/public/appointments/availability?fecha=YYYY-MM-DD[&token=...]
    fastify.get('/appointments/availability', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const fecha = String(request.query?.fecha || '');
        if (!DATE_RE.test(fecha) || isNaN(new Date(`${fecha}T12:00:00-06:00`).getTime()))
            return reply.code(400).send({ error: 'Fecha inválida.' });
        const own = request.query?.token ? await byToken(String(request.query.token)) : null;
        return reply.send(await availabilityFor(WORKSPACE_ID, fecha, { excludeId: own?.id }));
    });

    // POST /api/public/appointments — sin autenticacion, desde la landing
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

        if (!nombre) return reply.code(400).send({ error: 'El nombre es obligatorio.' });
        const phone = String(body.telefono || '').replace(/\D/g, '');
        if (!/^\d{10}$/.test(phone)) return reply.code(400).send({ error: 'Teléfono inválido — debe tener 10 dígitos.' });
        if (!fecha || !hora) return reply.code(400).send({ error: 'Fecha y hora son obligatorias.' });
        if (!servicio) return reply.code(400).send({ error: 'El tipo de servicio es obligatorio.' });
        if (anio && !/^\d{4}$/.test(anio)) return reply.code(400).send({ error: 'El año de la moto no es válido.' });
        if (!WORKSPACE_ID) return reply.code(503).send({ error: 'Servicio de citas no disponible temporalmente.' });

        const slot = await validateCustomerSlot(WORKSPACE_ID, fecha, hora);
        if (!slot.ok) return reply.code(slot.status).send({ error: slot.error });
        if (isRateLimited(phone)) return reply.code(429).send({ error: 'Demasiadas solicitudes. Intenta mañana.' });

        const moto = [marca, modelo, anio].filter(Boolean).join(' ');
        const existingClient = await prisma.client.findFirst({
            where: { workspace_id: WORKSPACE_ID, phone: { in: [phone, `52${phone}`, `+52${phone}`, `521${phone}`] } },
        });

        const created = await prisma.appointment.create({
            data: {
                workspace_id: WORKSPACE_ID,
                client_id: existingClient?.id || null,
                scheduled_date: slot.date,
                service_type: servicio,
                notes: notas || null,
                moto_label: moto || null,
                status: 'pending_external',
                source: 'external',
                client_phone: phone,
                client_name_ext: nombre,
                public_token: newToken(),
                shop_alert: false,
            },
            include: { client: true },
        });
        await logEvent(created, 'requested', 'customer', `${fecha} ${hora} · ${servicio}`);

        // Mensaje 1: "recibimos tu solicitud" (no bloquea la respuesta)
        notifyCustomer(created, 'received').catch((e) => console.error('[public/appt] WA received:', e.message));

        return reply.code(201).send({
            success: true, id: created.id, link: linkFor(created.public_token),
            message: '¡Cita solicitada! Te avisaremos por WhatsApp.',
        });
    });

    // ── Enlace unico del cliente ─────────────────────────────────────────
    const tokenLimit = { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } };

    // GET /api/public/appointments/by-token/:token
    fastify.get('/appointments/by-token/:token', tokenLimit, async (request, reply) => {
        const a = await byToken(request.params.token);
        if (!a) return notFound(reply);
        return reply.send(publicView(a));
    });

    // POST .../accept — el cliente acepta la propuesta del taller
    fastify.post('/appointments/by-token/:token/accept', tokenLimit, async (request, reply) => {
        const a = await byToken(request.params.token);
        if (!a) return notFound(reply);
        const live = a.status === 'proposal_sent' && a.proposal_expires_at && new Date(a.proposal_expires_at).getTime() > Date.now();
        if (!live) return reply.code(409).send({ error: 'Esta propuesta ya no está vigente.', view: publicView(a) });

        const updated = await prisma.appointment.update({
            where: { id: a.id },
            data: {
                scheduled_date: a.proposed_date, status: 'confirmed',
                proposed_date: null, proposal_note: null, proposal_expires_at: null,
                proposal_reminder_sent: false, proposal_from_confirmed: false,
                reminder_sent: false, reminder_2h_sent: false, decision_note: null, shop_alert: true,
            },
            include: { client: true },
        });
        await logEvent(updated, 'customer_accepted', 'customer', `Aceptó ${fmtFecha(updated.scheduled_date)} ${fmtHora(updated.scheduled_date)}`);
        notifyCustomer(updated, 'confirmed').catch(() => {});
        return reply.send(publicView(updated));
    });

    // POST .../choose — el cliente elige otra fecha/hora (queda "en revision" para el taller)
    fastify.post('/appointments/by-token/:token/choose', tokenLimit, async (request, reply) => {
        const a = await byToken(request.params.token);
        if (!a) return notFound(reply);
        if (['cancelled', 'completed'].includes(a.status))
            return reply.code(409).send({ error: 'Esta cita ya no se puede modificar. Agenda una nueva.', view: publicView(a) });
        const fecha = clean(request.body?.fecha, 10), hora = clean(request.body?.hora, 5);
        const slot = await validateCustomerSlot(a.workspace_id, fecha, hora, { excludeId: a.id });
        if (!slot.ok) return reply.code(slot.status).send({ error: slot.error });

        const before = `${fmtFecha(a.scheduled_date)} ${fmtHora(a.scheduled_date)}`;
        const updated = await prisma.appointment.update({
            where: { id: a.id },
            data: {
                scheduled_date: slot.date, status: 'pending_external',
                proposed_date: null, proposal_note: null, proposal_expires_at: null,
                proposal_reminder_sent: false, proposal_from_confirmed: false,
                reminder_sent: false, reminder_2h_sent: false, decision_note: null, cancelled_by: null, shop_alert: true,
            },
            include: { client: true },
        });
        await logEvent(updated, 'customer_chose', 'customer', `Pidió ${fmtFecha(slot.date)} ${fmtHora(slot.date)} (antes: ${before})`);
        notifyCustomer(updated, 'customerChose').catch(() => {});
        return reply.send(publicView(updated));
    });

    // POST .../decline — "No me sirve" ante una propuesta
    fastify.post('/appointments/by-token/:token/decline', tokenLimit, async (request, reply) => {
        const a = await byToken(request.params.token);
        if (!a) return notFound(reply);
        if (a.status !== 'proposal_sent') return reply.code(409).send({ error: 'No hay una propuesta pendiente.', view: publicView(a) });
        const keep = a.proposal_from_confirmed;
        const updated = await prisma.appointment.update({
            where: { id: a.id },
            data: {
                status: keep ? 'confirmed' : 'cancelled', cancelled_by: keep ? null : 'customer',
                proposed_date: null, proposal_note: null, proposal_expires_at: null,
                proposal_from_confirmed: false, shop_alert: true,
            },
            include: { client: true },
        });
        await logEvent(updated, 'customer_declined', 'customer', keep ? 'Rechazó el cambio; sigue su cita original' : 'Rechazó la propuesta; cita cancelada');
        notifyCustomer(updated, keep ? 'proposalDeclinedKeep' : 'cancelledByCustomer').catch(() => {});
        return reply.send(publicView(updated));
    });

    // POST .../cancel — el cliente cancela su cita
    fastify.post('/appointments/by-token/:token/cancel', tokenLimit, async (request, reply) => {
        const a = await byToken(request.params.token);
        if (!a) return notFound(reply);
        if (FINAL_STATUSES.includes(a.status)) return reply.code(409).send({ error: 'Esta cita ya no se puede cancelar.', view: publicView(a) });
        const updated = await prisma.appointment.update({
            where: { id: a.id },
            data: {
                status: 'cancelled', cancelled_by: 'customer',
                proposed_date: null, proposal_note: null, proposal_expires_at: null,
                proposal_from_confirmed: false, shop_alert: true,
            },
            include: { client: true },
        });
        await logEvent(updated, 'customer_cancelled', 'customer', 'El cliente canceló desde su enlace');
        notifyCustomer(updated, 'cancelledByCustomer').catch(() => {});
        return reply.send(publicView(updated));
    });
}
