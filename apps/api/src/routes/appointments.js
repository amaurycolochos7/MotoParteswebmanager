import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { fireEvent } from '../lib/events.js';
import {
    syncAppointmentToCalendar,
    removeAppointmentFromCalendar,
} from '../lib/calendar-sync.js';

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

async function sendApptNotification(workspaceId, appt, status) {
    try {
        const phone = appt.client?.phone || appt.client_phone;
        if (!phone) return;

        const session = await prisma.whatsappSession.findFirst({
            where: { workspace_id: workspaceId, is_connected: true },
        });
        if (!session?.mechanic_id) return;

        const nombre = appt.client?.full_name || appt.client_name_ext || 'Cliente';
        const fecha = new Date(appt.scheduled_date).toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
        const hora = new Date(appt.scheduled_date).toLocaleTimeString('es-MX', {
            hour: '2-digit', minute: '2-digit', hour12: true,
        });
        const servicio = appt.service_type || 'Servicio';

        let message;
        if (status === 'confirmed') {
            message =
                `¡Hola ${nombre}! ✅\n\n` +
                `*Tu cita ha sido CONFIRMADA* en Moto Partes.\n\n` +
                `📅 *Fecha:* ${fecha}\n` +
                `⏰ *Hora:* ${hora}\n` +
                `🔧 *Servicio:* ${servicio}\n\n` +
                `Por favor llega 5 minutos antes. ¡Te esperamos! 🏍️`;
        } else {
            message =
                `Hola ${nombre}, lamentablemente no podemos atenderte en la fecha solicitada.\n\n` +
                `Por favor contáctanos por WhatsApp para reagendar tu cita. ¡Gracias!`;
        }

        await fetch(`${BOT_URL}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
            body: JSON.stringify({ mechanicId: session.mechanic_id, phone: phone.startsWith('52') ? phone : `52${phone}`, message }),
            signal: AbortSignal.timeout(15000),
        });
    } catch (e) {
        console.error('[appt] WA notification failed:', e.message);
    }
}

export default async function appointmentsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/appointments
    fastify.get('/', async (request) => {
        const { mechanicId, status } = request.query;
        const where = {};
        if (mechanicId) where.assigned_mechanic_id = mechanicId;
        if (status) where.status = status;

        return prisma.appointment.findMany({
            where,
            include: {
                client: true,
                motorcycle: true,
                mechanic: { select: { id: true, full_name: true, phone: true } }
            },
            orderBy: { scheduled_date: 'asc' }
        });
    });

    // POST /api/appointments
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
                created_by: request.user.id
            }
        });
        // Sync a Google Calendar si el workspace está conectado (best-effort).
        syncAppointmentToCalendar(created.id, request.workspaceId).catch(() => {});
        return created;
    });

    // PUT /api/appointments/:id
    fastify.put('/:id', async (request) => {
        const updates = { ...request.body };
        if (updates.scheduled_date) updates.scheduled_date = new Date(updates.scheduled_date);

        const prev = await prisma.appointment.findUnique({
            where: { id: request.params.id },
            select: { status: true },
        });

        const updated = await prisma.appointment.update({
            where: { id: request.params.id },
            data: updates,
            include: {
                client: { select: { full_name: true, phone: true } },
            },
        });
        syncAppointmentToCalendar(updated.id, request.workspaceId).catch(() => {});

        const newStatus = updates.status;
        if (newStatus && prev?.status !== newStatus) {
            if (newStatus === 'confirmed' || newStatus === 'rejected') {
                // WhatsApp directo al cliente
                sendApptNotification(request.workspaceId, updated, newStatus).catch(() => {});
                // Evento para automaciones configuradas
                fireEvent(`appointment.${newStatus}`, {
                    workspaceId: request.workspaceId,
                    appointment_id: updated.id,
                }).catch(() => {});
            }
        }

        return updated;
    });

    // DELETE /api/appointments/:id
    fastify.delete('/:id', async (request) => {
        // Necesitamos el google_event_id antes de borrar.
        const appt = await prisma.appointment.findUnique({
            where: { id: request.params.id },
            select: { id: true, google_event_id: true },
        });
        await prisma.appointment.delete({ where: { id: request.params.id } });
        if (appt) {
            removeAppointmentFromCalendar(appt, request.workspaceId).catch(() => {});
        }
        return { success: true };
    });
}
