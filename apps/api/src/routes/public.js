import prisma from '../lib/prisma.js';
import {
    WORKSPACE_ID, FINAL_STATUSES, BLOCKING_STATUSES, DATE_RE, MAPS_URL, SHOP_NAME,
    newToken, linkFor, localParts, fmtFecha, fmtHora, validateCustomerSlot, availabilityFor,
    logEvent, notifyCustomer, notifyMechanic, listBookableMechanics, findBookableMechanic, markClientConfirmed,
} from '../lib/appointment-flow.js';
import { toLocal10, phoneVariants } from '../lib/phone.js';
import {
    clean, findSameMoto, buildMotoLabel, validateBookingBody, customerInputError,
    createRateLimiter, MAX_PENDING_PER_PHONE,
} from '../lib/booking.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Anti-spam: maximo N solicitudes por telefono cada 24 h (en memoria) ──
const PHONE_DAILY_LIMIT = parseInt(process.env.APPT_PHONE_DAILY_LIMIT || '6', 10) || 6;
const phoneLimiter = createRateLimiter({ max: PHONE_DAILY_LIMIT, windowMs: DAY_MS });
const isRateLimited = (phone) => phoneLimiter.hit(phone);

// ── Anti-curioseo del reconocimiento de telefono: por telefono y por dia (ademas del limite por IP) ──
const LOOKUP_IP_PER_MIN = parseInt(process.env.LOOKUP_IP_PER_MIN || '8', 10) || 8;
const LOOKUP_PHONE_PER_DAY = parseInt(process.env.LOOKUP_PHONE_PER_DAY || '20', 10) || 20;
const lookupLimiter = createRateLimiter({ max: LOOKUP_PHONE_PER_DAY, windowMs: DAY_MS });

setInterval(() => { phoneLimiter.sweep(); lookupLimiter.sweep(); }, 60 * 60 * 1000).unref();

const TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;
// Citas que cuentan como "pendientes de respuesta" para el tope por telefono.
const PENDING_STATUSES = ['pending_external', 'proposal_sent'];

// El telefono del mecanico solo se usa para armar el mensaje de WhatsApp al cliente; publicView() nunca lo devuelve.
const APPT_INCLUDE = { client: true, motorcycle: true, mechanic: { select: { id: true, full_name: true, phone: true } } };

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
        mecanico: a.mechanic?.full_name || null,
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
        return prisma.appointment.findFirst({ where: { public_token: token }, include: APPT_INCLUDE });
    };
    const notFound = (reply) => reply.code(404).send({ error: 'No encontramos esta cita. Revisa que el enlace esté completo.' });

    // GET /api/public/mechanics — quienes pueden atender (solo id y nombre; sin rol, telefono ni correo)
    fastify.get('/mechanics', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        if (!WORKSPACE_ID) return reply.code(503).send({ error: 'Servicio de citas no disponible temporalmente.' });
        return reply.send(await listBookableMechanics(WORKSPACE_ID));
    });

    // POST /api/public/lookup { telefono } — ¿ya es cliente? Devuelve su nombre y sus motos (marca/modelo/año).
    // POST (no GET) para que el numero no quede en enlaces ni registros. Nunca devuelve telefono,
    // placas, serie ni historial. Limitado por IP (ruta) y por telefono (en memoria).
    fastify.post('/lookup', {
        config: { rateLimit: { max: LOOKUP_IP_PER_MIN, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const phone = toLocal10(request.body?.telefono);
        if (!phone) return reply.code(400).send({ error: 'Teléfono inválido — debe tener 10 dígitos.' });
        if (!WORKSPACE_ID) return reply.code(503).send({ error: 'Servicio de citas no disponible temporalmente.' });
        if (lookupLimiter.hit(phone)) return reply.code(429).send({ error: 'Demasiados intentos con este número. Intenta más tarde.' });

        const client = await prisma.client.findFirst({
            where: { workspace_id: WORKSPACE_ID, phone: { in: phoneVariants(phone) } },
            select: {
                full_name: true,
                motorcycles: { select: { id: true, brand: true, model: true, year: true }, orderBy: { created_at: 'asc' } },
            },
        });
        if (!client) return reply.send({ found: false });
        return reply.send({
            found: true,
            nombre: client.full_name,
            motos: client.motorcycles.map((m) => ({ id: m.id, marca: m.brand, modelo: m.model, anio: m.year })),
        });
    });

    // GET /api/public/appointments/availability?fecha=YYYY-MM-DD[&mecanico_id=...][&token=...]
    // Con mecanico_id los horarios consideran la agenda de esa persona. Con token (pagina de la cita)
    // y sin mecanico_id se usa el mecanico que ya tiene esa cita.
    fastify.get('/appointments/availability', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const fecha = String(request.query?.fecha || '');
        if (!DATE_RE.test(fecha) || isNaN(new Date(`${fecha}T12:00:00-06:00`).getTime()))
            return reply.code(400).send({ error: 'Fecha inválida.' });
        const own = request.query?.token ? await byToken(String(request.query.token)) : null;
        let mechanicId = own?.assigned_mechanic_id || null;
        if (request.query?.mecanico_id) {
            const mech = await findBookableMechanic(WORKSPACE_ID, String(request.query.mecanico_id));
            if (!mech) return reply.code(400).send({ error: 'Esa persona ya no está disponible. Elige a otra, por favor.' });
            mechanicId = mech.id;
        }
        return reply.send(await availabilityFor(WORKSPACE_ID, fecha, { excludeId: own?.id, mechanicId }));
    });

    // POST /api/public/appointments — sin autenticacion, desde la landing
    // Cuerpo: telefono, mecanico_id (obligatorio), tipo_servicio, fecha, hora, notas, y
    //   - cliente nuevo: nombre + moto_marca + moto_modelo [+ moto_anio]
    //   - cliente que ya existe: moto_id (una suya) o moto nueva (moto_marca + moto_modelo [+ moto_anio])
    // Al enviar queda guardado como cliente (origin 'cita_web', web_unconfirmed) y su moto.
    fastify.post('/appointments', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const bad = (code, error) => reply.code(code).send({ error });

        const parsed = validateBookingBody(request.body || {});
        if (parsed.error) return bad(400, parsed.error);
        const d = parsed.data;
        if (!WORKSPACE_ID) return bad(503, 'Servicio de citas no disponible temporalmente.');

        const mech = await findBookableMechanic(WORKSPACE_ID, d.mecanicoId);
        if (!mech) return bad(400, 'Esa persona ya no está disponible. Elige a otra, por favor.');

        const variants = phoneVariants(d.phone);
        const existing = await prisma.client.findFirst({ where: { workspace_id: WORKSPACE_ID, phone: { in: variants } } });
        const inputErr = customerInputError(d, !!existing);
        if (inputErr) return bad(400, inputErr);
        if (d.motoId) {
            const own = await prisma.motorcycle.findFirst({ where: { id: d.motoId, client_id: existing.id, workspace_id: WORKSPACE_ID }, select: { id: true } });
            if (!own) return bad(400, 'La moto elegida no es válida.');
        }

        const slot = await validateCustomerSlot(WORKSPACE_ID, d.fecha, d.hora, { mechanicId: mech.id });
        if (!slot.ok) return bad(slot.status, slot.error);

        // Varias citas por cliente: si, pero no dos a la misma hora, ni mas de MAX_PENDING_PER_PHONE sin respuesta.
        const samePhone = { OR: [{ client_phone: { in: variants } }, { client: { phone: { in: variants } } }] };
        const clash = await prisma.appointment.findFirst({
            where: { workspace_id: WORKSPACE_ID, scheduled_date: slot.date, status: { in: BLOCKING_STATUSES }, ...samePhone },
            select: { id: true },
        });
        if (clash) return bad(409, 'Ya tienes una cita a esa hora. Elige otro horario.');
        const pending = await prisma.appointment.count({
            where: { workspace_id: WORKSPACE_ID, status: { in: PENDING_STATUSES }, ...samePhone },
        });
        if (pending >= MAX_PENDING_PER_PHONE)
            return bad(429, `Ya tienes ${MAX_PENDING_PER_PHONE} solicitudes esperando respuesta. Espera a que el taller las revise.`);
        if (isRateLimited(d.phone)) return bad(429, 'Demasiadas solicitudes. Intenta mañana.');

        // Cliente + moto + cita en una sola transaccion. Si dos solicitudes del mismo telefono nuevo
        // llegan a la vez, la segunda choca con la restriccion unica y se reintenta ya encontrando al cliente.
        let created;
        for (let attempt = 0; attempt < 2 && !created; attempt++) {
            try {
                created = await prisma.$transaction(async (tx) => {
                    let client = await tx.client.findFirst({ where: { workspace_id: WORKSPACE_ID, phone: { in: variants } } });
                    if (!client) {
                        client = await tx.client.create({
                            data: {
                                workspace_id: WORKSPACE_ID, phone: d.phone, full_name: d.nombre,
                                origin: 'cita_web', web_unconfirmed: true, preferred_mechanic_id: mech.id,
                            },
                        });
                    } else if (!client.preferred_mechanic_id) {
                        await tx.client.update({ where: { id: client.id }, data: { preferred_mechanic_id: mech.id } });
                    }

                    let moto = null;
                    if (d.motoId) {
                        moto = await tx.motorcycle.findFirst({ where: { id: d.motoId, client_id: client.id, workspace_id: WORKSPACE_ID } });
                        if (!moto) throw Object.assign(new Error('La moto elegida no es válida.'), { httpStatus: 400 });
                    } else {
                        const motos = await tx.motorcycle.findMany({ where: { client_id: client.id } });
                        moto = findSameMoto(motos, { marca: d.marca, modelo: d.modelo, anio: d.anio });
                        if (moto && !moto.year && d.anio) moto = await tx.motorcycle.update({ where: { id: moto.id }, data: { year: Number(d.anio) } });
                        if (!moto) {
                            moto = await tx.motorcycle.create({
                                data: { workspace_id: WORKSPACE_ID, client_id: client.id, brand: d.marca, model: d.modelo, year: d.anio ? Number(d.anio) : null },
                            });
                        }
                    }
                    const motoLabel = buildMotoLabel({ marca: moto.brand, modelo: moto.model, anio: moto.year });

                    return tx.appointment.create({
                        data: {
                            workspace_id: WORKSPACE_ID,
                            client_id: client.id,
                            motorcycle_id: moto.id,
                            assigned_mechanic_id: mech.id,
                            mechanic_requested: true,
                            scheduled_date: slot.date,
                            service_type: d.servicio,
                            notes: d.notas || null,
                            moto_label: motoLabel || null,
                            status: 'pending_external',
                            source: 'external',
                            client_phone: d.phone,
                            client_name_ext: d.nombre || client.full_name,
                            public_token: newToken(),
                            shop_alert: false,
                        },
                        include: APPT_INCLUDE,
                    });
                });
            } catch (e) {
                if (e.httpStatus) return bad(e.httpStatus, e.message);
                if (e.code === 'P2002' && attempt === 0) continue;
                throw e;
            }
        }
        await logEvent(created, 'requested', 'customer', `${d.fecha} ${d.hora} · ${d.servicio} · Atiende: ${mech.full_name}`);

        // Avisos por WhatsApp (no bloquean la respuesta; uno tras otro para no saturar al bot):
        // primero "recibimos tu solicitud" al cliente y luego el aviso al mecanico elegido.
        (async () => {
            await notifyCustomer(created, 'received').catch((e) => console.error('[public/appt] WA received:', e.message));
            await notifyMechanic(created, 'requested');
        })();

        return reply.code(201).send({
            success: true, id: created.id, link: linkFor(created.public_token),
            mecanico: mech.full_name,
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
            include: APPT_INCLUDE,
        });
        await logEvent(updated, 'customer_accepted', 'customer', `Aceptó ${fmtFecha(updated.scheduled_date)} ${fmtHora(updated.scheduled_date)}`);
        // Con la cita confirmada deja de ser un cliente "por confirmar".
        await markClientConfirmed(updated);
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
        // El mecanico elegido se conserva: el nuevo horario tambien debe estar libre en SU agenda.
        const slot = await validateCustomerSlot(a.workspace_id, fecha, hora, { excludeId: a.id, mechanicId: a.assigned_mechanic_id });
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
            include: APPT_INCLUDE,
        });
        await logEvent(updated, 'customer_chose', 'customer', `Pidió ${fmtFecha(slot.date)} ${fmtHora(slot.date)} (antes: ${before})`);
        notifyCustomer(updated, 'customerChose').catch(() => {});
        notifyMechanic(updated, 'customerChose');
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
            include: APPT_INCLUDE,
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
            include: APPT_INCLUDE,
        });
        await logEvent(updated, 'customer_cancelled', 'customer', 'El cliente canceló desde su enlace');
        notifyCustomer(updated, 'cancelledByCustomer').catch(() => {});
        notifyMechanic(updated, 'customerCancelled');
        return reply.send(publicView(updated));
    });
}
