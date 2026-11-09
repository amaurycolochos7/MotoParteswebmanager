// /api/inbox — bandeja "Conversaciones" de WhatsApp (V2). Ver docs/CONTRATO-V2.md.
// Acceso: owner / admin / maestro, o un auxiliar con can_view_inbox.
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loadActor, requirePermission } from '../lib/permissions.js';
import { sendToClient } from '../lib/wa-send.js';
import { digits } from '../lib/phone.js';
import { botCall, resolveSessionId } from '../lib/wa-session.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (reply, code, error) => reply.status(code).send({ error });

const mediaType = (mime) => (String(mime || '').startsWith('image/') ? 'image' : String(mime || '').split('/')[0] || 'file');

/** Fila de lista de conversaciones (forma del contrato). */
function toConversationItem(c, clientsById) {
    const client = c.client_id ? clientsById.get(c.client_id) : null;
    return {
        id: c.id,
        phone: c.phone,
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
            media: m.media_id && mime ? { id: m.media_id, type: mediaType(mime), mime } : null,
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
        return { id: conv.id, phone: conv.phone, display_name: conv.display_name || client?.full_name || null, client };
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

    // POST /api/inbox/conversations/:id/messages { text }
    fastify.post('/conversations/:id/messages', async (request, reply) => {
        const conv = await loadConversation(request.params.id);
        if (!conv) return bad(reply, 404, 'Conversación no encontrada.');
        const actor = await loadActor(request);
        if (!actor.can_send_messages && !['owner', 'admin', 'maestro'].includes(actor.role)) return bad(reply, 403, 'No tienes permiso para enviar mensajes.');
        const text = String(request.body?.text || '').trim();
        if (!text) return bad(reply, 400, 'El mensaje está vacío.');
        if (text.length > 4000) return bad(reply, 400, 'El mensaje es demasiado largo.');

        const r = await sendToClient(request.workspace.id, conv.phone, text, { origin: 'panel', sentBy: actor.id });
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

    // GET /api/inbox/media/:id — binario con control de acceso (mismo taller + permiso de bandeja)
    fastify.get('/media/:id', async (request, reply) => {
        if (!UUID_RE.test(String(request.params.id || ''))) return bad(reply, 404, 'Archivo no encontrado.');
        const media = await prisma.waMedia.findFirst({ where: { id: request.params.id } });
        if (!media) return bad(reply, 404, 'Archivo no encontrado.');
        reply.header('content-type', media.mime).header('cache-control', 'private, max-age=86400');
        return reply.send(Buffer.from(media.data));
    });
}
