// POST /api/internal/wa/event — eventos del bot de WhatsApp (mensajes entrantes/salientes y acuses).
// Solo para el bot (header x-api-key); NO lleva JWT y el proxy público no expone esta ruta.
import crypto from 'node:crypto';
import { BOT_KEY, workspaceOfSession } from '../lib/wa-session.js';
import {
    isIgnoredChat, phoneFromChat, upsertConversation, recordMessage, claimPendingOutbound, applyAck, storeMedia,
    claimHistoryOutbound, purgeUntaggedHistory, statusFromAck, betterStatus,
} from '../lib/wa-inbox.js';
import prisma from '../lib/prisma.js';
import { applyRemoteRevoke } from '../lib/wa-delete.js';

const safeEqual = (a, b) => {
    const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Procesa un evento del bot. Devuelve { ok, ignored?, reason? } (separado de la ruta para poder probarlo). */
export async function handleBotEvent(ev) {
    const sessionId = ev?.sessionId || ev?.workspaceSessionId;
    if (!sessionId) return { ok: false, status: 400, reason: 'sessionId requerido' };
    const workspaceId = await workspaceOfSession(sessionId);
    if (!workspaceId) return { ok: false, status: 404, reason: 'sesión sin taller' };

    if (ev.type === 'ack') {
        if (!ev.wa_message_id) return { ok: true, ignored: true };
        await applyAck(workspaceId, ev.wa_message_id, Number(ev.ack));
        return { ok: true };
    }
    if (ev.type === 'history') return handleHistoryEvent(workspaceId, ev);
    if (ev.type === 'revoke') {
        // El contacto (o el teléfono) eliminó un mensaje para todos
        const hit = await applyRemoteRevoke(workspaceId, [ev.wa_message_id, ...(Array.isArray(ev.alt_ids) ? ev.alt_ids : [])]);
        return { ok: true, revoked: !!hit };
    }
    if (ev.type !== 'message') return { ok: true, ignored: true };

    const direction = ev.direction === 'out' ? 'out' : 'in';
    const chatId = direction === 'in' ? ev.from : ev.to;
    if (isIgnoredChat(chatId) || ev.isGroup) return { ok: true, ignored: true };
    const phone = phoneFromChat(chatId, ev.numberHint);
    if (!phone) return { ok: true, ignored: true };

    // ¿Ya lo teníamos? (los eventos pueden repetirse)
    if (ev.wa_message_id) {
        const dup = await prisma.waMessage.findFirst({ where: { workspace_id: workspaceId, wa_message_id: ev.wa_message_id } });
        if (dup) return { ok: true, duplicate: true };
    }

    const conv = await upsertConversation(workspaceId, { phone, waChatId: chatId, displayName: direction === 'in' ? (ev.name || null) : null });
    const body = String(ev.body || '');
    const createdAt = ev.timestamp ? new Date(Number(ev.timestamp) * 1000) : new Date();

    if (direction === 'out') {
        // Mensaje que el servidor ya había registrado (aún sin id de WhatsApp): se le asigna el id y no se duplica.
        const claimed = ev.wa_message_id ? await claimPendingOutbound(workspaceId, conv.id, body, ev.wa_message_id) : null;
        if (claimed) return { ok: true, claimed: true };
    }

    let mediaId = null;
    if (ev.media?.base64) mediaId = await storeMedia(workspaceId, { mime: ev.media.mime, base64: ev.media.base64 });

    await recordMessage(workspaceId, conv, {
        direction,
        origin: direction === 'in' ? 'client' : 'phone', // saliente que no vino del panel ni del sistema: lo escribió alguien desde el teléfono
        body,
        mediaId,
        mediaType: ev.mediaType || (ev.media?.mime ? String(ev.media.mime).split('/')[0] : null),
        mediaMime: ev.media?.mime || ev.mediaMime || null,
        mediaName: ev.mediaName || null,
        mediaSeconds: ev.mediaSeconds || null,
        waMessageId: ev.wa_message_id || null,
        status: direction === 'in' ? 'delivered' : 'sent',
        createdAt,
    });
    return { ok: true };
}

/** Estado de un saliente del historial según su acuse de WhatsApp (sin acuse conocido = el actual). Nunca baja de estado. */
export function historyStatus(ack, current = 'sent') {
    if (typeof ack !== 'number' || ack < 1) return current;
    return betterStatus(current, statusFromAck(ack));
}

/**
 * Historial de un chat (importado al conectar o a mano): se guarda en orden cronológico, sin duplicar (por wa_message_id)
 * y SIN marcar nada como no leído (son mensajes viejos, no novedades).
 * - Un saliente que el servidor ya tenía registrado (automático / del panel) recibe su id en vez de duplicarse.
 * - Con `replaceUntagged`, al terminar se borran los mensajes viejos de ese chat que se guardaron SIN id de WhatsApp
 *   (importaciones anteriores a la corrección del id): este historial, que sí trae ids, los reemplaza.
 */
export async function handleHistoryEvent(workspaceId, ev) {
    const chat = ev.chat || {};
    if (!chat.id || isIgnoredChat(chat.id)) return { ok: true, ignored: true };
    const phone = phoneFromChat(chat.id, chat.numberHint);
    if (!phone) return { ok: true, ignored: true };
    const items = (Array.isArray(ev.messages) ? ev.messages : [])
        .filter((m) => m && m.body)
        .sort((x, y) => Number(x.timestamp || 0) - Number(y.timestamp || 0))
        .slice(0, 400);
    if (!items.length) return { ok: true, imported: 0 };
    const conv = await upsertConversation(workspaceId, { phone, waChatId: chat.id, displayName: chat.name || null });
    let imported = 0;
    let tagged = 0;
    for (const m of items) {
        const out = m.direction === 'out';
        const createdAt = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
        if (m.wa_message_id) tagged += 1;
        if (out && m.wa_message_id) {
            const claimed = await claimHistoryOutbound(workspaceId, conv.id, m.body, m.wa_message_id, createdAt);
            if (claimed) {
                // El automático/del panel ya estaba guardado: se le sube el estado si WhatsApp ya lo entregó o leyó.
                const better = historyStatus(m.ack, claimed.status);
                if (better !== claimed.status) await prisma.waMessage.update({ where: { id: claimed.id }, data: { status: better } });
                continue;
            }
        }
        const r = await recordMessage(workspaceId, conv, {
            direction: out ? 'out' : 'in',
            origin: out ? 'phone' : 'client',
            body: String(m.body),
            mediaType: m.mediaType || null,
            mediaMime: m.mediaMime || null,
            mediaName: m.mediaName || null,
            mediaSeconds: m.mediaSeconds || null,
            waMessageId: m.wa_message_id || null,
            status: out ? historyStatus(m.ack, 'sent') : 'delivered',
            createdAt,
            history: true,
        });
        if (r.created) imported += 1;
    }
    let replaced = 0;
    if (ev.replaceUntagged && tagged > 0) replaced = await purgeUntaggedHistory(workspaceId, conv.id);
    return { ok: true, imported, replaced };
}

export default async function internalWaRoutes(fastify) {
    fastify.addHook('preHandler', async (request, reply) => {
        if (!safeEqual(request.headers['x-api-key'], BOT_KEY)) return reply.status(401).send({ error: 'No autorizado' });
    });

    fastify.post('/event', { bodyLimit: 24 * 1024 * 1024 }, async (request, reply) => {
        try {
            const r = await handleBotEvent(request.body || {});
            if (!r.ok) return reply.status(r.status || 400).send({ error: r.reason });
            return r;
        } catch (e) {
            request.log.error(`[internal-wa] ${e.message}`);
            return reply.status(500).send({ error: 'error interno' });
        }
    });
}
