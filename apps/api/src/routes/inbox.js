// /api/inbox — bandeja "Conversaciones" de WhatsApp (V2). Ver docs/CONTRATO-V2.md.
// Acceso: owner / admin / maestro, o un auxiliar con can_view_inbox.
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loadActor, requirePermission } from '../lib/permissions.js';
import { sendToClient, sendVoiceToClient } from '../lib/wa-send.js';
import { digits } from '../lib/phone.js';
import { botCall, resolveSessionId } from '../lib/wa-session.js';
import { isRealPhone, storeMedia, MEDIA_MAX_BYTES } from '../lib/wa-inbox.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (reply, code, error) => reply.status(code).send({ error });

const mediaType = (mime) => (String(mime || '').startsWith('image/') ? 'image' : String(mime || '').split('/')[0] || 'file');

/** Fila de lista de conversaciones (forma del contrato). */
function toConversationItem(c, clientsById) {
    const client = c.client_id ? clientsById.get(c.client_id) : null;
    return {
        id: c.id,
        // Solo se muestra un teléfono REAL; los ids internos de WhatsApp (@lid) no son teléfonos y se ocultan.
        phone: isRealPhone(c.phone) ? c.phone : null,
        phone_known: isRealPhone(c.phone),
        display_name: c.display_name || client?.full_name || null,
        client: client ? { id: client.id, full_name: client.full_name } : null,
        last_message_preview: c.last_message_preview || '',
        last_message_at: c.last_message_at,
        last_direction: c.last_direction,
        unread_count: c.unread_count,
    };
}

async function clientsMap(rows) {
    const ids = [...new Set(rows.map((r) => r.client_id).filter(Boolean))];
    if (!ids.length) return new Map();
    const clients = await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true } });
    return new Map(clients.map((c) => [c.id, c]));
}

export default async function inboxRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);
    fastify.addHook('preHandler', requirePermission('can_view_inbox'));

    const loadConversation = async (id) => (UUID_RE.test(String(id || ''))
        ? prisma.waConversation.findFirst({ where: { id } })
        : null);

    async function toMessage(m, namesById, mimeById) {
        const mime = m.media_id ? mimeById.get(m.media_id) : null;
        return {
            id: m.id,
            direction: m.direction,
            origin: m.origin,
            body: m.body,
            // Con tipo conocido el panel pide el archivo por mensaje (GET /messages/:id/media), que lo baja de WhatsApp la 1a vez.
            media: (m.media_type || (m.media_id && mime))
                ? {
                    id: m.media_id || null, message_id: m.id, type: m.media_type || mediaType(mime), mime: mime || m.media_mime || null,
                    seconds: m.media_seconds ?? null, name: m.media_name || null, available: !!m.media_id,
                }
                : null,
            status: m.status,
            sent_by: m.sent_by ? { id: m.sent_by, full_name: namesById.get(m.sent_by) || null } : null,
            created_at: m.created_at,
        };
    }

    async function toMessages(rows) {
        const profileIds = [...new Set(rows.map((r) => r.sent_by).filter(Boolean))];
        const mediaIds = [...new Set(rows.map((r) => r.media_id).filter(Boolean))];
        const profiles = profileIds.length
            ? await prisma.profile.findMany({ where: { id: { in: profileIds } }, select: { id: true, full_name: true } })
            : [];
        const media = mediaIds.length
            ? await prisma.waMedia.findMany({ where: { id: { in: mediaIds } }, select: { id: true, mime: true } })
            : [];
        const names = new Map(profiles.map((p) => [p.id, p.full_name]));
        const mimes = new Map(media.map((x) => [x.id, x.mime]));
        return Promise.all(rows.map((r) => toMessage(r, names, mimes)));
    }

    // GET /api/inbox/conversations?q=&unread=1&limit=30&cursor=
    fastify.get('/conversations', async (request) => {
        const { q, unread, cursor } = request.query;
        const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 30, 1), 100);
        const where = { hidden: false };
        if (unread === '1' || unread === 'true') where.unread_count = { gt: 0 };
        if (cursor) {
            const d = new Date(String(cursor));
            if (!Number.isNaN(d.getTime())) where.last_message_at = { lt: d };
        }
        const text = String(q || '').trim();
        if (text) {
            const or = [{ display_name: { contains: text, mode: 'insensitive' } }];
            const d = digits(text);
            if (d.length >= 3) or.push({ phone: { contains: d } });
            const matchingClients = await prisma.client.findMany({
                where: { full_name: { contains: text, mode: 'insensitive' } }, select: { id: true }, take: 50,
            });
            if (matchingClients.length) or.push({ client_id: { in: matchingClients.map((c) => c.id) } });
            where.OR = or;
        }
        const rows = await prisma.waConversation.findMany({
            where, orderBy: { last_message_at: { sort: 'desc', nulls: 'last' } }, take: limit,
        });
        const clients = await clientsMap(rows);
        const items = rows.map((r) => toConversationItem(r, clients));
        const last = rows[rows.length - 1];
        return { items, next_cursor: rows.length === limit && last?.last_message_at ? new Date(last.last_message_at).toISOString() : null };
    });

    // POST /api/inbox/sync — vuelve a importar el historial de chats del teléfono (corre en el bot, en segundo plano).
    fastify.post('/sync', async (request, reply) => {
        const sessionId = await resolveSessionId(request.workspace.id);
        if (!sessionId) return reply.status(409).send({ error: 'WhatsApp del taller no está configurado.' });
        const res = await botCall(`/sessions/${sessionId}/sync-history`, { method: 'POST' });
        if (!res.ok) return reply.status(res.status === 503 || res.unreachable ? 409 : 502).send({ error: 'WhatsApp no está conectado en este momento. Intenta cuando aparezca como conectado.' });
        return { started: true };
    });

    // GET /api/inbox/unread-count — conversaciones con mensajes sin leer (campanita)
    fastify.get('/unread-count', async () => {
        const count = await prisma.waConversation.count({ where: { hidden: false, unread_count: { gt: 0 } } });
        return { count };
    });

    // GET /api/inbox/updates?since=<iso> — cambios desde la última consulta (el panel hace polling cada 4 s)
    fastify.get('/updates', async (request) => {
        const since = new Date(String(request.query.since || ''));
        const now = new Date();
        const where = Number.isNaN(since.getTime()) ? { hidden: false } : { updated_at: { gt: since } };
        const rows = await prisma.waConversation.findMany({ where, orderBy: { updated_at: 'desc' }, take: 100 });
        const clients = await clientsMap(rows);
        return { conversations: rows.filter((r) => !r.hidden).map((r) => toConversationItem(r, clients)), now: now.toISOString() };
    });

    // GET /api/inbox/conversations/:id — ficha de la conversación + cliente
    fastify.get('/conversations/:id', async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        let client = null;
        if (conv.client_id) {
            const c = await prisma.client.findFirst({
                where: { id: conv.client_id },
                include: { motorcycles: { select: { id: true, brand: true, model: true, year: true, plates: true } } },
            });
            if (c) {
                const [orders, appts] = await Promise.all([
                    prisma.order.findMany({
                        where: { client_id: c.id, status: { is_terminal: false } },
                        include: { status: { select: { name: true } }, motorcycle: { select: { brand: true, model: true } } },
                        orderBy: { created_at: 'desc' }, take: 10,
                    }),
                    prisma.appointment.findMany({
                        where: { client_id: c.id, scheduled_date: { gte: new Date() }, status: { in: ['scheduled', 'pending_external', 'confirmed', 'proposal_sent'] } },
                        orderBy: { scheduled_date: 'asc' }, take: 5,
                        select: { id: true, scheduled_date: true, status: true, service_type: true },
                    }),
                ]);
                client = {
                    id: c.id, full_name: c.full_name, phone: c.phone,
                    motorcycles: c.motorcycles,
                    open_orders: orders.map((o) => ({
                        id: o.id, order_number: o.order_number, status: o.status?.name || null,
                        motorcycle: o.motorcycle ? `${o.motorcycle.brand} ${o.motorcycle.model}` : null,
                    })),
                    upcoming_appointments: appts,
                };
            }
        }
        return { id: conv.id, phone: isRealPhone(conv.phone) ? conv.phone : null, phone_known: isRealPhone(conv.phone), display_name: conv.display_name || client?.full_name || null, client };
    });

    // GET /api/inbox/conversations/:id/messages?before=<iso>&limit=40 (ascendente dentro de la página)
    fastify.get('/conversations/:id/messages', async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 40, 1), 100);
        const where = { conversation_id: conv.id };
        if (request.query.before) {
            const d = new Date(String(request.query.before));
            if (!Number.isNaN(d.getTime())) where.created_at = { lt: d };
        }
        const rows = await prisma.waMessage.findMany({ where, orderBy: { created_at: 'desc' }, take: limit });
        rows.reverse();
        return { items: await toMessages(rows) };
    });

    // POST /api/inbox/conversations/:id/load-older — pide al bot cargar mensajes ANTERIORES de ese chat
    // (como hacer scroll hacia arriba en WhatsApp Web) y los guarda. Devuelve cuántos mensajes nuevos entraron.
    fastify.post('/conversations/:id/load-older', async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        if (!conv.wa_chat_id) return bad(reply, 409, 'Esta conversación no tiene identificador de chat en WhatsApp.');
        const sessionId = await resolveSessionId(request.workspace.id);
        if (!sessionId) return bad(reply, 409, 'WhatsApp del taller no está configurado.');
        const before = await prisma.waMessage.count({ where: { conversation_id: conv.id } });
        const res = await botCall(`/sessions/${sessionId}/load-chat`, { method: 'POST', body: { chatId: conv.wa_chat_id, limit: 200 }, timeoutMs: 90_000 });
        if (!res.ok) return bad(reply, res.status === 503 || res.unreachable ? 409 : 502, 'WhatsApp no está conectado en este momento. Intenta cuando aparezca como conectado.');
        const after = await prisma.waMessage.count({ where: { conversation_id: conv.id } });
        return { added: Math.max(0, after - before), total: after };
    });

    // POST /api/inbox/conversations/:id/messages { text }
    fastify.post('/conversations/:id/messages', async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        const actor = await loadActor(request);
        if (!actor.can_send_messages && !['owner', 'admin', 'maestro'].includes(actor.role)) return bad(reply, 403, 'No tienes permiso para enviar mensajes.');
        const text = String(request.body?.text || '').trim();
        if (!text) return bad(reply, 400, 'El mensaje está vacío.');
        if (text.length > 4000) return bad(reply, 400, 'El mensaje es demasiado largo.');

        // Se responde por el id REAL del chat (importa en chats @lid, donde no hay teléfono conocido).
        const r = await sendToClient(request.workspace.id, conv.phone, text, { origin: 'panel', sentBy: actor.id, chatId: conv.wa_chat_id || null });
        await prisma.waConversation.update({ where: { id: conv.id }, data: { unread_count: 0, hidden: false } });
        const row = r.id ? await prisma.waMessage.findFirst({ where: { id: r.id } }) : null;
        const [message] = row ? await toMessages([row]) : [null];
        if (!r.sent && !r.queued) return reply.status(502).send({ error: r.error || r.reason || 'No se pudo enviar el mensaje.', message });
        reply.status(201);
        return message;
    });

    // POST /api/inbox/conversations/:id/read
    fastify.post('/conversations/:id/read', async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        await prisma.waConversation.update({ where: { id: conv.id }, data: { unread_count: 0 } });
        return { success: true };
    });

    // POST /api/inbox/conversations/:id/hide — se oculta; reaparece si el cliente vuelve a escribir
    fastify.post('/conversations/:id/hide', async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        await prisma.waConversation.update({ where: { id: conv.id }, data: { hidden: true, unread_count: 0 } });
        return { success: true };
    });

    // GET /api/inbox/messages/:id/media — el archivo de un mensaje (audio, sticker, imagen, video, documento).
    // Si aún no está guardado se pide a WhatsApp (por el id del mensaje) y se conserva para la próxima.
    fastify.get('/messages/:id/media', async (request, reply) => {
        const m = UUID_RE.test(String(request.params.id || '')) ? await prisma.waMessage.findFirst({ where: { id: request.params.id } }) : null;
        if (!m || !(m.media_type || m.media_id)) return bad(reply, 404, 'Archivo no encontrado.');
        let media = m.media_id ? await prisma.waMedia.findFirst({ where: { id: m.media_id } }) : null;
        if (!media) {
            if (!m.wa_message_id) return bad(reply, 404, 'Este archivo ya no está disponible.');
            const sessionId = await resolveSessionId(request.workspace.id);
            if (!sessionId) return bad(reply, 409, 'WhatsApp del taller no está configurado.');
            const r = await botCall(`/sessions/${sessionId}/fetch-media`, { method: 'POST', body: { waMessageId: m.wa_message_id }, timeoutMs: 75_000 });
            if (!r.ok) return bad(reply, 409, 'WhatsApp no está conectado en este momento. Intenta cuando aparezca como conectado.');
            const d = r.data || {};
            if (d.error || !d.data) {
                const msg = d.error === 'expirado' ? 'El archivo ya expiró en WhatsApp.'
                    : d.error === 'muy_grande' ? 'El archivo es demasiado grande para verlo aquí.'
                        : 'No se pudo cargar el archivo (puede que ya no esté en WhatsApp).';
                return bad(reply, d.error === 'muy_grande' ? 413 : 404, msg);
            }
            const mediaId = await storeMedia(request.workspace.id, { mime: d.mime || m.media_mime || 'application/octet-stream', base64: d.data });
            if (!mediaId) return bad(reply, 413, 'El archivo es demasiado grande para verlo aquí.');
            await prisma.waMessage.update({
                where: { id: m.id },
                data: { media_id: mediaId, media_mime: d.mime || m.media_mime || undefined, media_name: d.filename || m.media_name || undefined, media_seconds: d.seconds ? Math.round(d.seconds) : (m.media_seconds ?? undefined) },
            });
            media = await prisma.waMedia.findFirst({ where: { id: mediaId } });
        }
        reply.header('content-type', media.mime).header('cache-control', 'private, max-age=86400');
        return reply.send(Buffer.from(media.data));
    });

    // POST /api/inbox/conversations/:id/voice { audio_base64, mime, seconds } — nota de voz desde el panel
    fastify.post('/conversations/:id/voice', { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        const actor = await loadActor(request);
        if (!actor.can_send_messages && !['owner', 'admin', 'maestro'].includes(actor.role)) return bad(reply, 403, 'No tienes permiso para enviar mensajes.');
        const b64 = String(request.body?.audio_base64 || '').replace(/^data:[^,]*,/, '');
        if (!b64) return bad(reply, 400, 'No llegó el audio.');
        if (Math.ceil(b64.length * 0.75) > MEDIA_MAX_BYTES) return bad(reply, 413, 'El audio es demasiado largo.');
        const seconds = Math.min(Math.max(Math.round(Number(request.body?.seconds) || 0), 0), 3600);
        const r = await sendVoiceToClient(request.workspace.id, conv, { base64: b64, mime: String(request.body?.mime || 'audio/webm').slice(0, 80), seconds }, { sentBy: actor.id });
        await prisma.waConversation.update({ where: { id: conv.id }, data: { unread_count: 0, hidden: false } });
        const row = r.id ? await prisma.waMessage.findFirst({ where: { id: r.id } }) : null;
        const [message] = row ? await toMessages([row]) : [null];
        if (!r.sent) return reply.status(502).send({ error: r.error || 'No se pudo enviar la nota de voz.', message });
        reply.status(201);
        return message;
    });

    // GET /api/inbox/media/:id — binario con control de acceso (mismo taller + permiso de bandeja)
    fastify.get('/media/:id', async (request, reply) => {
        if (!UUID_RE.test(String(request.params.id || ''))) return bad(reply, 404, 'Archivo no encontrado.');
        const media = await prisma.waMedia.findFirst({ where: { id: request.params.id } });
        if (!media) return bad(reply, 404, 'Archivo no encontrado.');
        reply.header('content-type', media.mime).header('cache-control', 'private, max-age=86400');
        return reply.send(Buffer.from(media.data));
    });
}
