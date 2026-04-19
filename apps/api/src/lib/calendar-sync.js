// Fase 6.4 — Sincronización one-way MotoPartes → Google Calendar.
//
// Se llama desde appointments.js en cada create/update/delete. Si el
// workspace no tiene tokens conectados, el wrapper no hace nada — el flujo
// funciona normal sin Calendar. Si el sync falla, loguea pero NO bloquea
// la operación local (el appointment se crea/guarda aunque GCal falle).

import prisma, { workspaceContext } from './prisma.js';
import {
    isGoogleCalendarConfigured,
    upsertCalendarEvent,
    deleteCalendarEvent,
} from './google-calendar.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

async function getWorkspaceTokens(workspaceId) {
    if (!isGoogleCalendarConfigured()) return null;
    const ws = await unscoped(() =>
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { google_calendar_tokens: true },
        })
    );
    const tok = ws?.google_calendar_tokens;
    if (!tok?.refresh_token && !tok?.access_token) return null;
    return tok;
}

// Busca los datos enriquecidos (cliente, moto) necesarios para el evento.
async function hydrateAppointment(id) {
    return unscoped(() =>
        prisma.appointment.findUnique({
            where: { id },
            include: {
                client: { select: { full_name: true, phone: true } },
                motorcycle: { select: { brand: true, model: true, license_plate: true } },
            },
        })
    );
}

export async function syncAppointmentToCalendar(appointmentId, workspaceId) {
    try {
        const tokens = await getWorkspaceTokens(workspaceId);
        if (!tokens) return null; // no conectado, todo ok.

        const appt = await hydrateAppointment(appointmentId);
        if (!appt) return null;

        const eventData = {
            google_event_id: appt.google_event_id,
            appointment_date: appt.scheduled_date,
            title: appt.service_type
                ? `${appt.service_type} — ${appt.client?.full_name || 'Cliente'}`
                : `Cita — ${appt.client?.full_name || 'Cliente'}`,
            description: appt.notes || '',
            client_name: appt.client?.full_name || null,
            client_phone: appt.client?.phone || null,
            motorcycle_label: appt.motorcycle
                ? `${appt.motorcycle.brand || ''} ${appt.motorcycle.model || ''} ${appt.motorcycle.license_plate ? `(${appt.motorcycle.license_plate})` : ''}`.trim()
                : null,
        };

        const newEventId = await upsertCalendarEvent({
            tokens,
            calendarId: tokens.calendar_id || 'primary',
            appointment: eventData,
        });

        if (newEventId && newEventId !== appt.google_event_id) {
            await unscoped(() =>
                prisma.appointment.update({
                    where: { id: appointmentId },
                    data: { google_event_id: newEventId },
                })
            );
        }
        return newEventId;
    } catch (err) {
        console.error('[calendar-sync] upsert failed:', err.message);
        return null;
    }
}

export async function removeAppointmentFromCalendar(appointment, workspaceId) {
    if (!appointment?.google_event_id) return;
    try {
        const tokens = await getWorkspaceTokens(workspaceId);
        if (!tokens) return;
        await deleteCalendarEvent({
            tokens,
            calendarId: tokens.calendar_id || 'primary',
            eventId: appointment.google_event_id,
        });
    } catch (err) {
        console.error('[calendar-sync] delete failed:', err.message);
    }
}
