import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { fireEvent } from '../lib/events.js';
import { syncAppointmentToCalendar, removeAppointmentFromCalendar } from '../lib/calendar-sync.js';
import {
    FINAL_STATUSES, DATE_RE, PROPOSAL_TTL_H, TZ_OFFSET,
    linkFor, localParts, fmtFecha, fmtHora, blockedReason, logEvent, notifyCustomer, ensureToken,
    notifyMechanic, markClientConfirmed,
} from '../lib/appointment-flow.js';

// Lista blanca de campos editables: nunca aceptar workspace_id, source, created_by...
const EDITABLE_FIELDS = [
    'scheduled_date', 'service_type', 'notes', 'status',
    'assigned_mechanic_id', 'client_id', 'motorcycle_id', 'moto_label',
];
const INCLUDE = {
    client: true,
    motorcycle: true,
    mechanic: { select: { id: true, full_name: true, phone: true } },
    events: { orderBy: { created_at: 'desc' }, take: 15 },
};
const CLEAR_PROPOSAL = {
    proposed_date: null, proposal_note: null, proposal_expires_at: null,
    proposal_reminder_sent: false, proposal_from_confirmed: false,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const withLink = (a) => (a ? { ...a, public_link: a.public_token ? linkFor(a.public_token) : null } : a);
const reasonOf = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');

export default async function appointmentsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // `mechanic` (solo nombre) permite que los mensajes al cliente digan quien lo atiende.
    const load = (id) => prisma.appointment.findFirst({ where: { id }, include: { client: true, motorcycle: true, mechanic: { select: { id: true, full_name: true, phone: true } } } });
    const full = async (id) => withLink(await prisma.appointment.findFirst({ where: { id }, include: INCLUDE }));
    const bad = (reply, code, error) => reply.code(code).send({ error });
    const sync = (id, ws) => syncAppointmentToCalendar(id, ws).catch(() => {});

    // GET /api/appointments[?mine=1][&mechanicId=...][&status=...]
    // mine=1 -> solo las citas asignadas al usuario que consulta ("Mis citas"). Cada fila trae
    // mechanic { id, full_name, phone } y el cliente completo.
    fastify.get('/', async (request) => {
        const { mechanicId, status, mine } = request.query;
        const where = {};
        if (mine === '1' || mine === 'true') where.assigned_mechanic_id = request.user.id;
        else if (mechanicId) where.assigned_mechanic_id = mechanicId;
        if (status) where.status = status;
        const rows = await prisma.appointment.findMany({ where, include: INCLUDE, orderBy: { scheduled_date: 'asc' } });
        return rows.map(withLink);
    });

    // GET /api/appointments/attention-count — globo del menu: solicitudes por revisar + respuestas del cliente
    fastify.get('/attention-count', async () => {
        const count = await prisma.appointment.count({
            where: { OR: [{ status: 'pending_external' }, { shop_alert: true }] },
        });
        return { count };
    });

    // GET /api/appointments/:id — una cita completa (cliente, moto, mecanico, historial y enlace).
    // El aviso de WhatsApp al mecanico lleva a /mechanic/appointments?cita=<id> y el panel usa esto.
    // (Las rutas fijas como /attention-count y /blocked-days tienen prioridad sobre /:id.)
    fastify.get('/:id', async (request, reply) => {
        if (!UUID_RE.test(request.params.id)) return bad(reply, 404, 'Cita no encontrada.');
        const a = await full(request.params.id);
        if (!a) return bad(reply, 404, 'Cita no encontrada.');
        return a;
    });

    // ── Dias sin servicio ────────────────────────────────────────────────
    fastify.get('/blocked-days', async () => {
        const today = localParts(new Date()).fecha;
        return prisma.blockedDay.findMany({ where: { date: { gte: today } }, orderBy: { date: 'asc' } });
    });

    fastify.post('/blocked-days', async (request, reply) => {
        const date = String(request.body?.date || '');
        if (!DATE_RE.test(date) || isNaN(new Date(`${date}T12:00:00${TZ_OFFSET}`).getTime())) return bad(reply, 400, 'Fecha inválida.');
        if (date < localParts(new Date()).fecha) return bad(reply, 400, 'Elige una fecha de hoy en adelante.');
        const reason = reasonOf(request.body?.reason) || null;
        const day = await prisma.blockedDay.upsert({
            where: { workspace_id_date: { workspace_id: request.workspace.id, date } },
            update: { reason },
            create: { workspace_id: request.workspace.id, date, reason },
        });
        // Citas ya tomadas ese dia: el taller debe moverlas (proponer otra fecha).
        const start = new Date(`${date}T00:00:00${TZ_OFFSET}`);
        const end = new Date(start.getTime() + 24 * 3600 * 1000);
        const affected = await prisma.appointment.findMany({
            where: { scheduled_date: { gte: start, lt: end }, status: { in: ['pending_external', 'confirmed', 'scheduled', 'proposal_sent'] } },
            include: { client: true },
        });
        return {
            day,
            affected: affected.map(a => ({
                id: a.id, status: a.status, hora: fmtHora(a.scheduled_date),
                nombre: a.client?.full_name || a.client_name_ext || 'Sin nombre', servicio: a.service_type,
            })),
        };
    });

    fastify.delete('/blocked-days/:id', async (request, reply) => {
        const row = await prisma.blockedDay.findFirst({ where: { id: request.params.id } });
        if (!row) return bad(reply, 404, 'No encontrado.');
        await prisma.blockedDay.delete({ where: { id: row.id } });
        return { success: true };
    });

    // POST /api/appointments (cita interna)
    fastify.post('/', async (request) => {
        const data = request.body;
        const created = await prisma.appointment.create({
            data: {
                client_id: data.client_id || null,
                motorcycle_id: data.motorcycle_id || null,
                assigned_mechanic_id: data.assigned_mechanic_id || null,
                scheduled_date: new Date(data.scheduled_date),
                service_type: data.service_type || null,
                notes: data.notes || null,
                status: 'scheduled',
                created_by: request.user.id,
            },
        });
        sync(created.id, request.workspace.id);
        if (created.assigned_mechanic_id && created.assigned_mechanic_id !== request.user.id) {
            const withRels = await load(created.id);
            notifyMechanic(withRels, 'assigned'); // sin await: no retrasa la respuesta
        }
        return created;
    });

    // ── Acciones del flujo ───────────────────────────────────────────────
    // Todas responden { appointment, whatsapp } para que el panel pueda ofrecer
    // "copiar mensaje / abrir WhatsApp" cuando el bot no esta conectado.

    // POST /:id/accept — aceptar la solicitud tal cual
    fastify.post('/:id/accept', async (request, reply) => {
        const a = await load(request.params.id);
        if (!a) return bad(reply, 404, 'Cita no encontrada.');
        if (['confirmed', 'completed', 'cancelled'].includes(a.status)) return bad(reply, 409, 'Esta cita ya no se puede aceptar.');
        await prisma.appointment.update({
            where: { id: a.id },
            data: { status: 'confirmed', ...CLEAR_PROPOSAL, decision_note: null, cancelled_by: null, shop_alert: false, reminder_sent: false, reminder_2h_sent: false },
        });
        const cur = await load(a.id);
        await markClientConfirmed(cur);
        await logEvent(cur, 'accepted', 'shop', `Confirmó ${fmtFecha(cur.scheduled_date)} ${fmtHora(cur.scheduled_date)}`);
        const whatsapp = await notifyCustomer(cur, 'confirmed');
        fireEvent('appointment.confirmed', { workspaceId: request.workspace.id, appointment_id: a.id }).catch(() => {});
        sync(a.id, request.workspace.id);
        return { appointment: await full(a.id), whatsapp };
    });

    // POST /:id/propose { scheduled_date, note } — proponer otra fecha/hora al cliente
    fastify.post('/:id/propose', async (request, reply) => {
        const a = await load(request.params.id);
        if (!a) return bad(reply, 404, 'Cita no encontrada.');
        if (['cancelled', 'completed'].includes(a.status)) return bad(reply, 409, 'Esta cita ya no se puede modificar.');
        const when = new Date(request.body?.scheduled_date);
        if (isNaN(when.getTime())) return bad(reply, 400, 'Fecha inválida.');
        if (when.getTime() < Date.now() + 30 * 60 * 1000) return bad(reply, 400, 'Elige una fecha y hora futuras.');
        const { fecha } = localParts(when);
        const blocked = await blockedReason(request.workspace.id, fecha);
        if (blocked) return bad(reply, 400, `Marcaste ese día sin servicio (${blocked.replace(/\.$/, '')}). Elige otra fecha.`);

        const note = reasonOf(request.body?.note) || null;
        const fromConfirmed = a.status === 'confirmed' || (a.status === 'proposal_sent' && a.proposal_from_confirmed);
        const expires = new Date(Date.now() + PROPOSAL_TTL_H * 3600 * 1000);
        await ensureToken(a);
        await prisma.appointment.update({
            where: { id: a.id },
            data: {
                status: 'proposal_sent', proposed_date: when, proposal_note: note, proposal_expires_at: expires,
                proposal_reminder_sent: false, proposal_from_confirmed: fromConfirmed, decision_note: null, shop_alert: false,
            },
        });
        const cur = await load(a.id);
        await logEvent(cur, 'proposed', 'shop', `Propuso ${fmtFecha(when)} ${fmtHora(when)}${note ? ` · ${note}` : ''}`);
        const whatsapp = await notifyCustomer(cur, 'proposal', { newDate: when, note, expires, fromConfirmed });
        sync(a.id, request.workspace.id);
        return { appointment: await full(a.id), whatsapp };
    });

    // POST /:id/reject { reason } — no podemos atenderte (el cliente puede elegir otra fecha)
    fastify.post('/:id/reject', async (request, reply) => {
        const a = await load(request.params.id);
        if (!a) return bad(reply, 404, 'Cita no encontrada.');
        if (['confirmed', 'completed', 'cancelled'].includes(a.status)) return bad(reply, 409, 'Para una cita confirmada usa "Cancelar cita".');
        const reason = reasonOf(request.body?.reason) || null;
        await prisma.appointment.update({
            where: { id: a.id },
            data: { status: 'rejected', ...CLEAR_PROPOSAL, decision_note: reason, shop_alert: false },
        });
        const cur = await load(a.id);
        await logEvent(cur, 'rejected', 'shop', reason || 'No disponible');
        const whatsapp = await notifyCustomer(cur, 'unavailable', { reason });
        fireEvent('appointment.rejected', { workspaceId: request.workspace.id, appointment_id: a.id }).catch(() => {});
        sync(a.id, request.workspace.id);
        return { appointment: await full(a.id), whatsapp };
    });

    // POST /:id/cancel { reason } — cancelar la cita
    fastify.post('/:id/cancel', async (request, reply) => {
        const a = await load(request.params.id);
        if (!a) return bad(reply, 404, 'Cita no encontrada.');
        if (FINAL_STATUSES.includes(a.status)) return bad(reply, 409, 'Esta cita ya no se puede cancelar.');
        const reason = reasonOf(request.body?.reason) || null;
        await prisma.appointment.update({
            where: { id: a.id },
            data: { status: 'cancelled', ...CLEAR_PROPOSAL, cancelled_by: 'shop', decision_note: reason, shop_alert: false },
        });
        const cur = await load(a.id);
        await logEvent(cur, 'cancelled', 'shop', reason || 'Cancelada por el taller');
        const whatsapp = await notifyCustomer(cur, 'cancelledByShop', { reason });
        sync(a.id, request.workspace.id);
        return { appointment: await full(a.id), whatsapp };
    });

    // POST /:id/seen — el taller ya vio la respuesta del cliente
    fastify.post('/:id/seen', async (request, reply) => {
        const a = await load(request.params.id);
        if (!a) return bad(reply, 404, 'Cita no encontrada.');
        await prisma.appointment.update({ where: { id: a.id }, data: { shop_alert: false } });
        return { success: true };
    });

    // GET /:id/events — historial
    fastify.get('/:id/events', async (request, reply) => {
        const a = await load(request.params.id);
        if (!a) return bad(reply, 404, 'Cita no encontrada.');
        return prisma.appointmentEvent.findMany({ where: { appointment_id: a.id }, orderBy: { created_at: 'desc' }, take: 50 });
    });

    // PUT /api/appointments/:id — edicion generica (cita interna / notas)
    fastify.put('/:id', async (request, reply) => {
        const updates = {};
        for (const k of EDITABLE_FIELDS) {
            if (request.body && request.body[k] !== undefined) updates[k] = request.body[k];
        }
        const prev = await load(request.params.id);
        if (!prev) return bad(reply, 404, 'Cita no encontrada.');
        if (updates.scheduled_date) {
            updates.scheduled_date = new Date(updates.scheduled_date);
            if (isNaN(updates.scheduled_date.getTime())) return bad(reply, 400, 'Fecha inválida.');
            // Mover una cita ya confirmada de un cliente requiere que el cliente lo acepte.
            if (prev.source === 'external' && prev.status === 'confirmed' && updates.scheduled_date.getTime() !== new Date(prev.scheduled_date).getTime())
                return bad(reply, 409, 'Para mover una cita confirmada envía una propuesta al cliente.');
        }
        // Estados con mensaje al cliente van por sus acciones (evita mensajes duplicados o sin enlace).
        if (updates.status && ['confirmed', 'rejected', 'cancelled', 'proposal_sent'].includes(updates.status) && updates.status !== prev.status)
            return bad(reply, 400, 'Usa Aceptar, Proponer otra fecha, No disponible o Cancelar para cambiar el estado.');

        // Si el taller cambia de mecanico, ya no es "el que eligio el cliente" y se le avisa al nuevo.
        const reassigned = updates.assigned_mechanic_id !== undefined && (updates.assigned_mechanic_id || null) !== (prev.assigned_mechanic_id || null);
        if (reassigned) updates.mechanic_requested = false;
        const updated = await prisma.appointment.update({ where: { id: prev.id }, data: updates, include: INCLUDE });
        if (reassigned && updated.assigned_mechanic_id && updated.assigned_mechanic_id !== request.user.id) {
            notifyMechanic(await load(updated.id), 'assigned');
        }
        sync(updated.id, request.workspace.id);
        return withLink(updated);
    });

    // DELETE /api/appointments/:id
    fastify.delete('/:id', async (request) => {
        const appt = await prisma.appointment.findUnique({
            where: { id: request.params.id },
            select: { id: true, google_event_id: true },
        });
        await prisma.appointment.delete({ where: { id: request.params.id } });
        if (appt) removeAppointmentFromCalendar(appt, request.workspace.id).catch(() => {});
        return { success: true };
    });
}
