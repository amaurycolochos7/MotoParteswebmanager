// Fase 6.4 — Integración Google Calendar (one-way: MotoPartes → Calendar).
//
// Setup requerido del dueño (fuera de código):
//   1. Ir a Google Cloud Console → Create project "motopartes-cloud".
//   2. APIs & Services → Enable "Google Calendar API".
//   3. OAuth consent screen → External → llenar con motopartes.cloud.
//   4. Credentials → OAuth client ID (Web application):
//      - Authorized redirect URI: https://motopartes.cloud/api/integrations/google/callback
//                                 http://localhost:3000/api/integrations/google/callback (dev)
//   5. Copiar Client ID y Client Secret a las env vars del API:
//      - GOOGLE_CLIENT_ID=...
//      - GOOGLE_CLIENT_SECRET=...
//      - GOOGLE_REDIRECT_URI=https://motopartes.cloud/api/integrations/google/callback
//
// Si las env vars NO están, `isGoogleCalendarConfigured()` devuelve false y
// las rutas retornan 501 sin romper.

import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export function isGoogleCalendarConfigured() {
    return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI
    );
}

export function createOAuthClient() {
    if (!isGoogleCalendarConfigured()) {
        throw new Error('Google Calendar no está configurado en este servidor.');
    }
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

export function getAuthUrl(state) {
    const client = createOAuthClient();
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // fuerza refresh_token siempre
        scope: SCOPES,
        state,
    });
}

export async function exchangeCode(code) {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    return tokens; // { access_token, refresh_token, expiry_date, scope, token_type }
}

// Devuelve un oauth2Client autenticado con refresh automático si el token expiró.
// Si el refresh falla (e.g. el usuario revocó la app), la función throws y el
// llamador debe considerar la conexión perdida.
export function clientFromStoredTokens(tokens) {
    const client = createOAuthClient();
    client.setCredentials(tokens);
    return client;
}

export async function ensureFreshTokens(stored) {
    const client = clientFromStoredTokens(stored);
    // googleapis refresca automáticamente si expiry_date ya pasó.
    const refreshed = await client.getAccessToken();
    if (refreshed && refreshed.res?.data) {
        return { ...stored, ...refreshed.res.data };
    }
    return stored;
}

// Crea o actualiza un evento en el calendario primary del owner.
// Devuelve el event id de Google — el llamador lo persiste en
// appointment.google_event_id para futuras actualizaciones.
export async function upsertCalendarEvent({ tokens, calendarId = 'primary', appointment }) {
    const client = clientFromStoredTokens(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const start = new Date(appointment.appointment_date).toISOString();
    const end = appointment.end_time
        ? new Date(appointment.end_time).toISOString()
        : new Date(new Date(appointment.appointment_date).getTime() + 60 * 60 * 1000).toISOString();

    const body = {
        summary: appointment.title || `Cita — ${appointment.client_name || 'Cliente'}`,
        description:
            `${appointment.description || ''}\n\nCliente: ${appointment.client_name || '—'}\nMoto: ${appointment.motorcycle_label || '—'}\nTeléfono: ${appointment.client_phone || '—'}\n\nMotoPartes`.trim(),
        start: { dateTime: start },
        end: { dateTime: end },
        reminders: { useDefault: true },
    };

    if (appointment.google_event_id) {
        try {
            const updated = await calendar.events.update({
                calendarId,
                eventId: appointment.google_event_id,
                requestBody: body,
            });
            return updated.data.id;
        } catch (err) {
            // Si el evento ya no existe en GCal (fue borrado manualmente), creamos uno nuevo.
            if (err?.code === 404 || err?.code === 410) {
                const created = await calendar.events.insert({ calendarId, requestBody: body });
                return created.data.id;
            }
            throw err;
        }
    }

    const created = await calendar.events.insert({ calendarId, requestBody: body });
    return created.data.id;
}

export async function deleteCalendarEvent({ tokens, calendarId = 'primary', eventId }) {
    if (!eventId) return;
    const client = clientFromStoredTokens(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    try {
        await calendar.events.delete({ calendarId, eventId });
    } catch (err) {
        if (err?.code === 404 || err?.code === 410) return; // ya no existía
        throw err;
    }
}
