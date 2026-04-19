import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import {
    syncAppointmentToCalendar,
    removeAppointmentFromCalendar,
} from '../lib/calendar-sync.js';

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
        const updated = await prisma.appointment.update({
            where: { id: request.params.id },
            data: updates
        });
        syncAppointmentToCalendar(updated.id, request.workspaceId).catch(() => {});
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
