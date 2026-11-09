// Foto de perfil de WhatsApp de cada contacto. El bot la baja (sin pedir nada al usuario) y aquí se guarda una copia en WaMedia,
// para que el panel la pida con su JWT como cualquier otro archivo. Se revisa de nuevo cada 7 días (por si la cambiaron).
//
// La cola corre en segundo plano, de una en una y con pausa, para no saturar a WhatsApp Web. Nunca lanza.
import prisma, { workspaceContext } from './prisma.js';
import { botCall, resolveSessionId } from './wa-session.js';
import { storeMedia, isRealPhone } from './wa-inbox.js';
import { toWaNumber } from './phone.js';

export const AVATAR_STALE_MS = 7 * 24 * 3600 * 1000;
const GAP_MS = 1200;
const OFFLINE_BACKOFF_MS = 5 * 60 * 1000;
const MAX_QUEUE = 300;

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);

/** Id de chat de WhatsApp para pedir la foto: el real si se conoce, o el del teléfono. */
export function chatIdOf(conv) {
    if (conv.wa_chat_id && /^\d+@(lid|c\.us)$/.test(conv.wa_chat_id)) return conv.wa_chat_id;
    return isRealPhone(conv.phone) ? `${toWaNumber(conv.phone)}@c.us` : null;
}

/** ¿Toca pedir (otra vez) la foto de esta conversación? */
export const needsAvatarCheck = (conv, now = Date.now()) =>
    !conv.avatar_checked_at || now - new Date(conv.avatar_checked_at).getTime() > AVATAR_STALE_MS;

const queue = new Map(); // conversationId -> workspaceId
const offlineUntil = new Map(); // workspaceId -> ms
let running = false;

/** Encola las conversaciones que necesiten foto. Devuelve cuántas se encolaron. */
export function queueAvatarRefresh(workspaceId, convs) {
    let n = 0;
    for (const c of convs) {
        if (queue.size >= MAX_QUEUE) break;
        if (queue.has(c.id) || !needsAvatarCheck(c) || !chatIdOf(c)) continue;
        queue.set(c.id, workspaceId); n += 1;
    }
    if (n && !running) { running = true; setTimeout(() => runQueue().catch(() => {}), 50).unref?.(); }
    return n;
}

/** Pide la foto de UNA conversación al bot y la guarda. Devuelve 'saved' | 'none' | 'offline' | 'skipped'. */
export async function refreshAvatar(workspaceId, convId) {
    const conv = await unscoped(() => prisma.waConversation.findFirst({ where: { id: convId, workspace_id: workspaceId } }));
    const chatId = conv && chatIdOf(conv);
    if (!conv || !chatId) return 'skipped';
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) return 'offline';
    const r = await botCall(`/sessions/${sessionId}/profile-pic`, { method: 'POST', body: { chatId }, timeoutMs: 25_000 });
    if (!r.ok) return 'offline';
    const d = r.data || {};
    if (d.error) return 'offline'; // fallo del bot (no es "sin foto"): se reintenta más tarde
    let mediaId = null;
    if (d.data) mediaId = await storeMedia(workspaceId, { mime: d.mime || 'image/jpeg', base64: d.data });
    await unscoped(async () => {
        await prisma.waConversation.update({ where: { id: conv.id }, data: { avatar_media_id: mediaId, avatar_checked_at: new Date() } });
        if (conv.avatar_media_id && conv.avatar_media_id !== mediaId) await prisma.waMedia.deleteMany({ where: { id: conv.avatar_media_id } });
    });
    return mediaId ? 'saved' : 'none';
}

async function runQueue() {
    try {
        while (queue.size) {
            const [convId, workspaceId] = queue.entries().next().value;
            queue.delete(convId);
            if ((offlineUntil.get(workspaceId) || 0) > Date.now()) continue;
            try {
                const res = await refreshAvatar(workspaceId, convId);
                if (res === 'offline') offlineUntil.set(workspaceId, Date.now() + OFFLINE_BACKOFF_MS);
            } catch (e) {
                console.error('[wa-avatar]', e.message);
            }
            await new Promise((r) => setTimeout(r, GAP_MS));
        }
    } finally {
        running = false;
    }
}
