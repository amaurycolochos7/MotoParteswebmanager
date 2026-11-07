// Flujo de la cita en linea: solicitud -> revision -> (confirmada | propuesta | no disponible).
//
// Aqui vive TODO lo compartido entre la API publica (cliente, enlace unico) y la API
// del taller (panel de MotoPartes): textos de WhatsApp, envio, validacion de horarios y
// las tareas automaticas (recordatorios y vencimientos).
import crypto from 'node:crypto';
import prisma from './prisma.js';

// ── Configuracion ────────────────────────────────────────────────────────
// Chiapas = CST (UTC-6), sin horario de verano desde 2022.
export const TZ_OFFSET = '-06:00';
export const TZ = 'America/Mexico_City';
export const SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
export const SLOT_CAPACITY = Math.max(1, parseInt(process.env.APPT_SLOT_CAPACITY || '2', 10) || 2);
export const MAX_DAYS_AHEAD = 120;
export const PROPOSAL_TTL_H = parseInt(process.env.APPT_PROPOSAL_TTL_HOURS || '24', 10) || 24;
export const PROPOSAL_REMINDER_AFTER_H = Math.floor(PROPOSAL_TTL_H / 2);
export const PUBLIC_BASE = (process.env.PUBLIC_APPT_BASE || 'https://vc.motopartes.cloud/cita').replace(/\/$/, '');
export const MAPS_URL = process.env.SHOP_MAPS_URL || 'https://maps.app.goo.gl/5ettAZT7YhUaKfCT8';
export const SHOP_NAME = 'MOTOPARTES';
export const WORKSPACE_ID = process.env.LANDING_VC_WORKSPACE_ID || 'c4bca2c8-1ca2-49c0-a084-8b677439c731';
const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

// Estados que ocupan lugar en la agenda por su scheduled_date.
export const BLOCKING_STATUSES = ['scheduled', 'pending_external', 'confirmed'];
// Estados que ya no se pueden modificar.
export const FINAL_STATUSES = ['cancelled', 'rejected', 'expired', 'completed'];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Tokens y enlaces ─────────────────────────────────────────────────────
export const newToken = () => crypto.randomBytes(18).toString('base64url'); // 24 caracteres
export const linkFor = (token) => `${PUBLIC_BASE}/${token}`;

export async function ensureToken(appt) {
    if (appt.public_token) return appt.public_token;
    for (let i = 0; i < 3; i++) {
        try {
            const token = newToken();
            await prisma.appointment.update({ where: { id: appt.id }, data: { public_token: token } });
            appt.public_token = token;
            return token;
        } catch (e) {
            if (e.code !== 'P2002') throw e; // colision de token (practicamente imposible): reintenta
        }
    }
    throw new Error('No se pudo generar el enlace de la cita');
}

// ── Fechas (todo en hora de Chiapas) ─────────────────────────────────────
const MX_MS = 6 * 3600 * 1000;
export function localParts(date) {
    const l = new Date(new Date(date).getTime() - MX_MS).toISOString();
    return { fecha: l.slice(0, 10), hora: l.slice(11, 16) };
}
export function fmtFecha(date) {
    return new Date(date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
}
export function fmtHora(date) {
    const { hora } = localParts(date);
    const [h, m] = hora.split(':').map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export function slotDate(fecha, hora) {
    if (!DATE_RE.test(fecha || '') || !SLOTS.includes(hora)) return null;
    const d = new Date(`${fecha}T${hora}:00${TZ_OFFSET}`);
    return isNaN(d.getTime()) ? null : d;
}
export const isSunday = (fecha) => new Date(`${fecha}T12:00:00${TZ_OFFSET}`).getUTCDay() === 0;

// ── Dias sin servicio y cupo ─────────────────────────────────────────────
export async function blockedReason(workspaceId, fecha) {
    const row = await prisma.blockedDay.findFirst({ where: { workspace_id: workspaceId, date: fecha } });
    return row ? (row.reason || 'Ese día no hay servicio.') : null;
}

// Citas por hora de un dia. Una propuesta vigente aparta SU horario propuesto; si la
// propuesta cambia una cita ya confirmada, tambien sigue apartando la original.
export async function slotLoad(workspaceId, fecha, { excludeId } = {}) {
    const start = new Date(`${fecha}T00:00:00${TZ_OFFSET}`);
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    const notSelf = excludeId ? { id: { not: excludeId } } : {};
    const [byDate, byProposal] = await Promise.all([
        prisma.appointment.findMany({
            where: {
                workspace_id: workspaceId, ...notSelf,
                scheduled_date: { gte: start, lt: end },
                OR: [{ status: { in: BLOCKING_STATUSES } }, { status: 'proposal_sent', proposal_from_confirmed: true }],
            },
            select: { scheduled_date: true },
        }),
        prisma.appointment.findMany({
            where: {
                workspace_id: workspaceId, ...notSelf, status: 'proposal_sent',
                proposal_expires_at: { gt: new Date() }, proposed_date: { gte: start, lt: end },
            },
            select: { proposed_date: true },
        }),
    ]);
    const counts = {};
    const add = (d) => { const slot = `${localParts(d).hora.slice(0, 2)}:00`; counts[slot] = (counts[slot] || 0) + 1; };
    byDate.forEach(r => add(r.scheduled_date));
    byProposal.forEach(r => add(r.proposed_date));
    return counts;
}

// Valida una fecha/hora elegida por un CLIENTE (formulario o enlace).
export async function validateCustomerSlot(workspaceId, fecha, hora, { excludeId } = {}) {
    const date = slotDate(fecha, hora);
    if (!date) return { ok: false, status: 400, error: 'Fecha u hora inválida.' };
    if (isSunday(fecha)) return { ok: false, status: 400, error: 'No atendemos domingos. Elige otro día.' };
    const blocked = await blockedReason(workspaceId, fecha);
    if (blocked) return { ok: false, status: 400, error: blocked.endsWith('.') ? blocked : `${blocked}. Elige otro día.` };
    const now = Date.now();
    if (date.getTime() < now + 3600 * 1000) return { ok: false, status: 400, error: 'Elige una fecha y hora futuras.' };
    if (date.getTime() > now + MAX_DAYS_AHEAD * 24 * 3600 * 1000)
        return { ok: false, status: 400, error: 'Solo puedes agendar con hasta 4 meses de anticipación.' };
    const load = await slotLoad(workspaceId, fecha, { excludeId });
    if ((load[hora] || 0) >= SLOT_CAPACITY)
        return { ok: false, status: 409, error: 'Ese horario ya se ocupó. Elige otra hora, por favor.' };
    return { ok: true, date };
}

// Horarios de un dia para mostrar al cliente.
export async function availabilityFor(workspaceId, fecha, { excludeId } = {}) {
    if (isSunday(fecha)) return { fecha, closed: true, reason: 'No atendemos domingos.', slots: SLOTS.map(h => ({ hora: h, available: false })) };
    const blocked = await blockedReason(workspaceId, fecha);
    if (blocked) return { fecha, closed: true, reason: blocked, slots: SLOTS.map(h => ({ hora: h, available: false })) };
    const load = await slotLoad(workspaceId, fecha, { excludeId });
    const now = Date.now();
    return {
        fecha, closed: false,
        slots: SLOTS.map(h => ({ hora: h, available: slotDate(fecha, h).getTime() > now + 3600 * 1000 && (load[h] || 0) < SLOT_CAPACITY })),
    };
}

// ── Historial ────────────────────────────────────────────────────────────
export async function logEvent(appt, type, actor, detail) {
    try {
        await prisma.appointmentEvent.create({
            data: { workspace_id: appt.workspace_id, appointment_id: appt.id, type, actor, detail: detail ? String(detail).slice(0, 500) : null },
        });
    } catch (e) {
        console.error('[appt] no se pudo guardar el evento', type, e.message);
    }
}

// ── Textos de WhatsApp ───────────────────────────────────────────────────
const motoLine = (m) => (m ? `🏍️ ${m}\n` : '');

export const MSG = {
    received: ({ nombre, date, servicio, moto, link }) =>
        `¡Hola ${nombre}! 👋\nRecibimos tu solicitud de cita en *${SHOP_NAME}* 🏍️\n\n` +
        `📅 ${fmtFecha(date)}\n⏰ ${fmtHora(date)}\n🔧 ${servicio}\n${motoLine(moto)}\n` +
        `Tu solicitud está *en revisión*. Tan pronto la revisemos te responderemos por aquí para confirmarla o proponerte otro horario.\n\n` +
        `Puedes ver el estado de tu cita aquí:\n${link}`,

    confirmed: ({ nombre, date, servicio, moto, link }) =>
        `✅ *¡Tu cita está confirmada!*\n\n${nombre}, te esperamos en *${SHOP_NAME}*:\n` +
        `📅 ${fmtFecha(date)}\n⏰ ${fmtHora(date)}\n🔧 ${servicio}\n${motoLine(moto)}` +
        `📍 Venustiano Carranza, Chiapas\n${MAPS_URL}\n\n` +
        `Si necesitas cambiarla o cancelarla entra aquí:\n${link}\n\n¡Gracias por confiar en nosotros! 🙌`,

    proposal: ({ nombre, date, newDate, note, link, expires, fromConfirmed }) =>
        `Hola ${nombre} 👋\n` +
        (fromConfirmed
            ? `Necesitamos mover tu cita del *${fmtFecha(date)} a las ${fmtHora(date)}*.\n`
            : `Revisamos tu solicitud del *${fmtFecha(date)} a las ${fmtHora(date)}* y en ese horario no podremos atenderte.\n`) +
        `\nTe proponemos:\n📅 *${fmtFecha(newDate)}*\n⏰ *${fmtHora(newDate)}*\n` +
        (note ? `\n💬 ${note}\n` : '') +
        `\nEntra aquí para *aceptar* la propuesta o elegir otro día:\n${link}\n\n` +
        `Tu horario queda apartado hasta el ${fmtFecha(expires)} a las ${fmtHora(expires)}.`,

    proposalReminder: ({ nombre, newDate, expires, link }) =>
        `Hola ${nombre} 👋 sigue pendiente tu cita propuesta para el *${fmtFecha(newDate)} a las ${fmtHora(newDate)}*.\n` +
        `Tu horario sigue apartado hasta el ${fmtFecha(expires)} a las ${fmtHora(expires)}.\n\nConfírmala aquí:\n${link}`,

    proposalExpired: ({ nombre, link }) =>
        `Hola ${nombre}, tu propuesta de cita venció y liberamos el horario.\n` +
        `Si aún quieres agendar, elige una nueva fecha aquí:\n${link}`,

    proposalExpiredKeep: ({ nombre, date, link }) =>
        `Hola ${nombre}, la propuesta de cambio venció, así que *tu cita original sigue confirmada*:\n` +
        `📅 ${fmtFecha(date)}\n⏰ ${fmtHora(date)}\n\nSi necesitas moverla: ${link}`,

    proposalDeclinedKeep: ({ date, link }) =>
        `Entendido 👍 No haremos el cambio: *tu cita original sigue confirmada*:\n` +
        `📅 ${fmtFecha(date)}\n⏰ ${fmtHora(date)}\n\nSi necesitas moverla: ${link}`,

    customerChose: ({ nombre, date }) =>
        `Recibimos tu respuesta 👍\nRevisaremos el *${fmtFecha(date)} a las ${fmtHora(date)}* y te confirmamos por aquí.`,

    unavailable: ({ nombre, date, reason, link }) =>
        `Hola ${nombre}, por el momento no podemos atender tu solicitud para el *${fmtFecha(date)}*.` +
        (reason ? `\n💬 ${reason}` : '') +
        `\n\nElige otra fecha cuando gustes:\n${link}`,

    reminder24: ({ nombre, date, link }) =>
        `⏰ Recordatorio: tu cita en *${SHOP_NAME}* es *${fmtFecha(date)} a las ${fmtHora(date)}* 🏍️\n📍 ${MAPS_URL}\n\n¿Cambio de planes? ${link}`,

    reminder2: ({ nombre, date, link }) =>
        `⏰ Te esperamos hoy a las *${fmtHora(date)}* en *${SHOP_NAME}* 🏍️\n📍 ${MAPS_URL}\n\n¿Cambio de planes? ${link}`,

    cancelledByCustomer: ({ nombre, date, link }) =>
        `Tu cita del *${fmtFecha(date)} a las ${fmtHora(date)}* fue cancelada.\nCuando quieras agendar otra:\n${link}`,

    cancelledByShop: ({ nombre, date, reason, link }) =>
        `Hola ${nombre}, tuvimos que cancelar tu cita del *${fmtFecha(date)} a las ${fmtHora(date)}*.` +
        (reason ? `\n💬 ${reason}` : '') +
        `\n\nOfrecemos una disculpa. Puedes agendar otra cuando gustes:\n${link}`,
};

// ── Envio por WhatsApp ───────────────────────────────────────────────────
export function normalizePhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10) return `52${d}`;
    if (d.length === 13 && d.startsWith('521')) return `52${d.slice(3)}`;
    return d;
}

export async function sendWhatsApp(workspaceId, phone, text) {
    try {
        const to = normalizePhone(phone);
        if (!to) return { sent: false, reason: 'sin_telefono' };
        const session = await prisma.whatsappSession.findFirst({ where: { workspace_id: workspaceId, is_connected: true } });
        if (!session?.mechanic_id) return { sent: false, reason: 'whatsapp_desconectado' };
        const res = await fetch(`${BOT_URL}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
            body: JSON.stringify({ mechanicId: session.mechanic_id, phone: to, message: text }),
            signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) return { sent: false, reason: `bot_${res.status}` };
        return { sent: true };
    } catch (e) {
        return { sent: false, reason: e.message };
    }
}

// Datos que necesitan los textos, a partir de la fila de la cita.
export function ctxOf(appt, extra = {}) {
    return {
        nombre: (appt.client?.full_name || appt.client_name_ext || 'cliente').split(' ')[0],
        nombreCompleto: appt.client?.full_name || appt.client_name_ext || 'Cliente',
        date: appt.scheduled_date,
        servicio: appt.service_type || 'Servicio',
        moto: appt.moto_label || (appt.motorcycle ? `${appt.motorcycle.brand} ${appt.motorcycle.model}` : ''),
        link: appt.public_token ? linkFor(appt.public_token) : '',
        ...extra,
    };
}
export const phoneOf = (appt) => appt.client?.phone || appt.client_phone || null;

// Construye, envia y registra. Devuelve { sent, text, link, phone, reason } para que el panel
// pueda ofrecer "copiar mensaje" cuando WhatsApp no esta disponible.
export async function notifyCustomer(appt, kind, extra = {}, opts = {}) {
    const token = await ensureToken(appt);
    const text = MSG[kind](ctxOf(appt, extra));
    const phone = phoneOf(appt);
    const result = phone ? await sendWhatsApp(appt.workspace_id, phone, text) : { sent: false, reason: 'sin_telefono' };
    if (!result.sent && !opts.quiet) await logEvent(appt, 'wa_failed', 'system', `${kind}: ${result.reason}`);
    return { ...result, text, link: linkFor(token), phone: phone ? normalizePhone(phone) : null };
}

// ── Tareas automaticas ───────────────────────────────────────────────────
const FULL_INCLUDE = { client: true, motorcycle: true };

async function hasReminderAutomation(workspaceId) {
    const n = await prisma.automation.count({
        where: { workspace_id: workspaceId, enabled: true, trigger: { startsWith: 'appointment.upcoming' } },
    });
    return n > 0;
}

export async function runAppointmentJobs() {
    const now = new Date();

    // 1) Recordatorio de propuesta pendiente (a mitad de la vigencia)
    const toRemind = await prisma.appointment.findMany({
        where: {
            status: 'proposal_sent', proposal_reminder_sent: false,
            proposal_expires_at: { gt: now, lte: new Date(now.getTime() + (PROPOSAL_TTL_H - PROPOSAL_REMINDER_AFTER_H) * 3600 * 1000) },
        },
        include: FULL_INCLUDE,
    });
    for (const a of toRemind) {
        await prisma.appointment.update({ where: { id: a.id }, data: { proposal_reminder_sent: true } });
        await notifyCustomer(a, 'proposalReminder', { newDate: a.proposed_date, expires: a.proposal_expires_at });
        await logEvent(a, 'reminder', 'system', 'Recordatorio de propuesta');
    }

    // 2) Propuestas vencidas
    const expired = await prisma.appointment.findMany({
        where: { status: 'proposal_sent', proposal_expires_at: { lte: now } },
        include: FULL_INCLUDE,
    });
    for (const a of expired) {
        const keep = a.proposal_from_confirmed;
        await prisma.appointment.update({
            where: { id: a.id },
            data: {
                status: keep ? 'confirmed' : 'expired',
                proposed_date: null, proposal_note: null, proposal_expires_at: null,
                proposal_from_confirmed: false, shop_alert: true,
            },
        });
        a.status = keep ? 'confirmed' : 'expired';
        await logEvent(a, 'expired', 'system', keep ? 'Venció la propuesta; la cita original sigue confirmada' : 'Venció la propuesta sin respuesta');
        await notifyCustomer(a, keep ? 'proposalExpiredKeep' : 'proposalExpired');
    }

    // 3) Recordatorios de cita (1 dia antes y 2 h antes) para TODA cita confirmada o agendada,
    //    venga del sitio web o de la app, salvo que el taller tenga su propia automatizacion.
    //    Ventanas: 24 h -> se envia al cruzar las 24 h (hasta 22 h, por si el servidor estuvo caido);
    //              2 h  -> se envia al cruzar las 2 h (hasta 1 h antes).
    //    Si WhatsApp no esta conectado no se marca como enviado y se reintenta en el siguiente ciclo
    //    mientras siga dentro de la ventana.
    const soon = await prisma.appointment.findMany({
        where: { status: { in: ['confirmed', 'scheduled'] }, scheduled_date: { gt: now, lte: new Date(now.getTime() + 24 * 3600 * 1000) } },
        include: FULL_INCLUDE,
    });
    const skipWs = new Map();
    const deliver = async (a, kind, flag, label) => {
        const r = await notifyCustomer(a, kind, {}, { quiet: true });
        if (r.sent) {
            await prisma.appointment.update({ where: { id: a.id }, data: { [flag]: true } });
            await logEvent(a, 'reminder', 'system', label);
        } else if (r.reason === 'sin_telefono') {
            await prisma.appointment.update({ where: { id: a.id }, data: { [flag]: true } });   // no hay a quien avisar: no reintentar
            await logEvent(a, 'wa_failed', 'system', `${kind}: sin_telefono`);
        }
        // otro fallo (bot desconectado, etc.): sin marcar -> reintenta en 5 min
    };
    for (const a of soon) {
        if (!skipWs.has(a.workspace_id)) skipWs.set(a.workspace_id, await hasReminderAutomation(a.workspace_id));
        if (skipWs.get(a.workspace_id)) continue;
        const hrs = (new Date(a.scheduled_date).getTime() - now.getTime()) / 3600000;
        if (hrs <= 24 && hrs > 22 && !a.reminder_sent) await deliver(a, 'reminder24', 'reminder_sent', 'Recordatorio de 1 día antes');
        else if (hrs <= 2 && hrs > 1 && !a.reminder_2h_sent) await deliver(a, 'reminder2', 'reminder_2h_sent', 'Recordatorio de 2 h antes');
    }
}

let jobsTimer = null;
export function startAppointmentJobs(log = console) {
    if (jobsTimer) return;
    const tick = async () => {
        try { await runAppointmentJobs(); } catch (e) { log.error?.(`[appt-jobs] ${e.message}`); }
    };
    setTimeout(tick, 30_000).unref();
    jobsTimer = setInterval(tick, 5 * 60 * 1000);
    jobsTimer.unref();
}
