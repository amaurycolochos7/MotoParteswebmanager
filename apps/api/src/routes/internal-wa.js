// POST /api/internal/wa/event — eventos del bot de WhatsApp (mensajes entrantes/salientes y acuses).
// Solo para el bot (header x-api-key); NO lleva JWT y el proxy público no expone esta ruta.
import crypto from 'node:crypto';
import { BOT_KEY, workspaceOfSession } from '../lib/wa-session.js';
import {
    isIgnoredChat, phoneFromChat, upsertConversation, recordMessage, claimPendingOutbound, applyAck, storeMedia,
} from '../lib/wa-inbox.js';
import prisma from '../lib/prisma.js';

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
        waMessageId: ev.wa_message_id || null,
        status: direction === 'in' ? 'delivered' : 'sent',
        createdAt,
    });
    return { ok: true };
}

export default async function internalWaRoutes(fastify) {
    fastify.addHook('preHandler', async (request, reply) => {
        if (!safeEqual(request.headers['x-api-key'], BOT_KEY)) return reply.status(401).send({ error: 'No autorizado' });
    });

    fastify.post('/event', { bodyLimit: 6 * 1024 * 1024 }, async (request, reply) => {
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
