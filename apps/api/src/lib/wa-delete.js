// Eliminar mensajes de la bandeja, como en WhatsApp Web:
//   - "para mí":     el mensaje deja de verse SOLO para quien lo eliminó (WaMessage.hidden_for); el resto del equipo lo sigue viendo.
//   - "para todos":  se revoca en WhatsApp (el cliente ve "Se eliminó este mensaje") y aquí queda la marca "Eliminaste este mensaje".
//                    WhatsApp solo lo permite en mensajes propios y durante un tiempo limitado.
import prisma from './prisma.js';
import { botCall, resolveSessionId } from './wa-session.js';
import { isAdminRole } from './permissions.js';

/** Tiempo máximo que WhatsApp deja eliminar un mensaje para todos (2 días 12 horas). */
export const REVOKE_WINDOW_MS = (2 * 24 + 12) * 3600 * 1000;
export const REVOKED_PREVIEW = { out: 'Eliminaste este mensaje', in: 'Se eliminó este mensaje' };

/**
 * ¿Este actor puede eliminar el mensaje PARA TODOS? (puro)
 *  - solo mensajes salientes que no estén ya eliminados;
 *  - dentro de la ventana de WhatsApp (si nunca llegó a WhatsApp —sin id— no hay límite: solo se borra aquí);
 *  - dueño/administrador/maestro: cualquiera del taller; los demás, solo los que ellos escribieron desde el panel.
 */
export function canRevokeForAll(m, actor, now = Date.now()) {
    if (!m || !actor || m.direction !== 'out' || m.revoked_at) return false;
    if (m.wa_message_id && now - new Date(m.created_at).getTime() > REVOKE_WINDOW_MS) return false;
    if (isAdminRole(actor.role) || actor.role === 'maestro') return true;
    return !!m.sent_by && m.sent_by === actor.id;
}

/**
 * Deja un mensaje como eliminado: borra su contenido y archivo y, si era el último del chat, actualiza la vista previa.
 * Idempotente. `by` = Profile.id de quien lo eliminó (null si fue el contacto o el teléfono).
 */
export async function markRevoked(workspaceId, message, by = null) {
    if (!message || message.revoked_at) return message || null;
    const updated = await prisma.waMessage.update({
        where: { id: message.id },
        data: {
            revoked_at: new Date(), revoked_by: by, body: '', error: null,
            media_id: null, media_type: null, media_mime: null, media_name: null, media_seconds: null,
        },
    });
    if (message.media_id) await prisma.waMedia.deleteMany({ where: { id: message.media_id } }).catch(() => {});
    const conv = await prisma.waConversation.findFirst({ where: { id: message.conversation_id } });
    if (conv) {
        const newest = !conv.last_message_at || new Date(message.created_at) >= new Date(conv.last_message_at);
        await prisma.waConversation.update({
            where: { id: conv.id },
            data: newest
                ? { last_message_preview: REVOKED_PREVIEW[message.direction === 'out' ? 'out' : 'in'], updated_at: new Date() }
                : { updated_at: new Date() },
        });
    }
    return updated;
}

/** El contacto (o el teléfono) eliminó un mensaje para todos: llega del bot. Devuelve el mensaje o null si no se conocía. */
export async function applyRemoteRevoke(workspaceId, waMessageIds) {
    const ids = (Array.isArray(waMessageIds) ? waMessageIds : [waMessageIds]).filter(Boolean);
    if (!ids.length) return null;
    const msg = await prisma.waMessage.findFirst({ where: { workspace_id: workspaceId, wa_message_id: { in: ids } } });
    return msg ? markRevoked(workspaceId, msg, null) : null;
}

const ERRORS = {
    no_encontrado: 'WhatsApp ya no tiene ese mensaje.',
    no_permitido: 'WhatsApp ya no permite eliminar este mensaje para todos (pasó demasiado tiempo).',
};

/** Pide al bot revocar el mensaje en WhatsApp. Devuelve { ok } o { ok:false, error, status }. */
async function revokeInWhatsApp(workspaceId, message) {
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) return { ok: false, status: 409, error: 'WhatsApp del taller no está configurado.' };
    const r = await botCall(`/sessions/${sessionId}/delete-message`, { method: 'POST', body: { waMessageId: message.wa_message_id, everyone: true }, timeoutMs: 40_000 });
    if (!r.ok) return { ok: false, status: 409, error: 'WhatsApp no está conectado en este momento. Intenta cuando aparezca como conectado.' };
    const code = r.data?.error;
    if (code) return { ok: false, status: code === 'no_permitido' ? 403 : 404, error: ERRORS[code] || 'No se pudo eliminar el mensaje en WhatsApp.' };
    return { ok: true };
}

/**
 * Elimina varios mensajes. `scope`: 'me' | 'everyone'. Devuelve [{ id, ok, error? }] en el mismo orden.
 * Cada mensaje se valida por separado: los que no se pueden quedan con su motivo y los demás sí se eliminan.
 */
export async function deleteMessages(workspaceId, actor, ids, scope) {
    const rows = await prisma.waMessage.findMany({ where: { workspace_id: workspaceId, id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const results = [];
    for (const id of ids) {
        const m = byId.get(id);
        if (!m) { results.push({ id, ok: false, error: 'Mensaje no encontrado.' }); continue; }
        if (scope === 'me') {
            if (!m.hidden_for.includes(actor.id)) await prisma.waMessage.update({ where: { id }, data: { hidden_for: { push: actor.id } } });
            results.push({ id, ok: true });
            continue;
        }
        if (m.revoked_at) { results.push({ id, ok: true }); continue; }
        if (!canRevokeForAll(m, actor)) {
            results.push({ id, ok: false, error: m.direction !== 'out' ? 'Solo puedes eliminar para todos los mensajes que enviaste.' : 'No puedes eliminar este mensaje para todos (pasó demasiado tiempo o no es tuyo).' });
            continue;
        }
        if (m.wa_message_id) {
            const r = await revokeInWhatsApp(workspaceId, m);
            if (!r.ok) { results.push({ id, ok: false, error: r.error }); continue; }
        } else {
            // Nunca llegó a WhatsApp (en cola o fallido): solo se cancela aquí y se saca de la cola de reintentos.
            await prisma.waOutbox.updateMany({ where: { workspace_id: workspaceId, status: 'pending', context: { path: ['message_id'], equals: id } }, data: { status: 'failed', last_error: 'Eliminado desde el panel.' } }).catch(() => {});
        }
        await markRevoked(workspaceId, m, actor.id);
        results.push({ id, ok: true });
    }
    return results;
}
