// Bandeja de conversaciones de WhatsApp: guardar y consultar mensajes (V2).
// Las funciones reciben SIEMPRE el workspaceId (se pueden llamar desde el webhook del bot o desde trabajos sin
// petición); por eso pasan workspace_id explícito y no dependen del auto-scope.
import prisma from './prisma.js';
import { toLocal10, digits, phoneVariants } from './phone.js';

export const MEDIA_MAX_BYTES = 12 * 1024 * 1024; // por archivo (audio, imagen, video corto, documento)
export const MEDIA_RETENTION_DAYS = 90;          // pasado ese tiempo se borra la copia; se vuelve a pedir a WhatsApp si alguien la abre
export const MEDIA_TYPES = new Set(['image', 'sticker', 'audio', 'ptt', 'video', 'document']);
/** Tipo de archivo válido (image, sticker, audio, ptt, video, document) o null. */
export const normalizeMediaType = (t) => (MEDIA_TYPES.has(String(t || '').toLowerCase()) ? String(t).toLowerCase() : null);

/** Teléfono canónico (10 dígitos MX o dígitos completos) a partir del id de chat de WhatsApp. */
export function phoneFromChat(chatId, hintNumber) {
    const [user, domain] = String(chatId || '').split('@');
    const candidate = domain === 'c.us' ? user : (hintNumber || user);
    return toLocal10(candidate) || digits(candidate);
}

/** ¿Es un teléfono real (10 dígitos MX o con lada 52)? Los ids internos de WhatsApp (@lid, ~15 dígitos) NO lo son. */
export function isRealPhone(phone) {
    return toLocal10(phone) !== null;
}

/** ¿Es un chat que la bandeja debe ignorar (grupos, estados, listas de difusión)? */
export function isIgnoredChat(chatId) {
    const id = String(chatId || '');
    return !id || id.endsWith('@g.us') || id.startsWith('status@') || id.endsWith('@broadcast') || id.endsWith('@newsletter');
}

/** Texto corto para la lista de conversaciones. */
export function previewOf(body, mediaType) {
    const text = String(body || '').replace(/\s+/g, ' ').trim();
    if (text) return text.length > 120 ? `${text.slice(0, 117)}...` : text;
    if (mediaType === 'image') return '[Imagen]';
    if (mediaType) return `[${mediaType}]`;
    return '';
}

/** ack de WhatsApp -> estado del contrato. */
export function statusFromAck(ack) {
    if (ack === -1) return 'failed';
    if (ack >= 3) return 'read';
    if (ack === 2) return 'delivered';
    if (ack === 1) return 'sent';
    return 'queued';
}
const STATUS_RANK = { failed: 0, queued: 1, sent: 2, delivered: 3, read: 4 };
export const betterStatus = (current, next) => (STATUS_RANK[next] > STATUS_RANK[current] ? next : current);

/** Busca/crea la conversación de un teléfono y la vincula con el cliente si existe. */
export async function upsertConversation(workspaceId, { phone, waChatId = null, displayName = null }) {
    let conv = await prisma.waConversation.findFirst({
        where: { workspace_id: workspaceId, OR: [{ phone }, ...(waChatId ? [{ wa_chat_id: waChatId }] : [])] },
    });
    if (!conv) {
        try {
            conv = await prisma.waConversation.create({
                data: { workspace_id: workspaceId, phone, wa_chat_id: waChatId, display_name: displayName },
            });
        } catch (e) {
            if (e.code !== 'P2002') throw e; // carrera: otro evento la creó primero
            conv = await prisma.waConversation.findFirst({ where: { workspace_id: workspaceId, phone } });
        }
    }
    const patch = {};
    if (waChatId && conv.wa_chat_id !== waChatId && !String(conv.wa_chat_id || '').endsWith('@c.us')) patch.wa_chat_id = waChatId;
    if (displayName && !conv.display_name) patch.display_name = displayName;
    if (!conv.client_id) {
        const variants = phoneVariants(phone);
        if (variants.length) {
            const client = await prisma.client.findFirst({
                where: { workspace_id: workspaceId, phone: { in: variants } }, select: { id: true },
            });
            if (client) patch.client_id = client.id;
        }
    }
    if (Object.keys(patch).length) conv = await prisma.waConversation.update({ where: { id: conv.id }, data: patch });
    return conv;
}

/** Guarda un archivo (imagen) en la BD con tope de tamaño. Devuelve el id o null. */
export async function storeMedia(workspaceId, { mime, base64 }) {
    if (!base64 || !mime) return null;
    const data = Buffer.from(base64, 'base64');
    if (data.length === 0 || data.length > MEDIA_MAX_BYTES) return null;
    const row = await prisma.waMedia.create({ data: { workspace_id: workspaceId, mime, size: data.length, data } });
    return row.id;
}

/**
 * Registra un mensaje en la conversación y actualiza su resumen.
 * Si el wa_message_id ya existe devuelve el existente (los eventos del bot pueden repetirse).
 */
export async function recordMessage(workspaceId, conv, m) {
    if (m.waMessageId) {
        const dup = await prisma.waMessage.findFirst({ where: { workspace_id: workspaceId, wa_message_id: m.waMessageId } });
        if (dup) {
            // Un mensaje ya guardado sin datos de archivo (importado antes) los recibe ahora.
            const patch = {};
            const mt = normalizeMediaType(m.mediaType);
            if (mt && !dup.media_type) patch.media_type = mt;
            if (m.mediaMime && !dup.media_mime) patch.media_mime = m.mediaMime;
            if (m.mediaName && !dup.media_name) patch.media_name = m.mediaName;
            if (m.mediaSeconds && !dup.media_seconds) patch.media_seconds = Math.round(Number(m.mediaSeconds));
            if (m.mediaId && !dup.media_id) patch.media_id = m.mediaId;
            if (Object.keys(patch).length) return { message: await prisma.waMessage.update({ where: { id: dup.id }, data: patch }), created: false };
            return { message: dup, created: false };
        }
    }
    const createdAt = m.createdAt || new Date();
    let message;
    try {
        message = await prisma.waMessage.create({
            data: {
                workspace_id: workspaceId,
                conversation_id: conv.id,
                wa_message_id: m.waMessageId || null,
                direction: m.direction,
                origin: m.origin,
                body: m.body || '',
                media_id: m.mediaId || null,
                media_type: normalizeMediaType(m.mediaType),
                media_mime: m.mediaMime || null,
                media_name: m.mediaName ? String(m.mediaName).slice(0, 200) : null,
                media_seconds: m.mediaSeconds ? Math.round(Number(m.mediaSeconds)) : null,
                status: m.status || (m.direction === 'in' ? 'delivered' : 'sent'),
                sent_by: m.sentBy || null,
                error: m.error || null,
                created_at: createdAt,
            },
        });
    } catch (e) {
        if (e.code === 'P2002' && m.waMessageId) {
            const again = await prisma.waMessage.findFirst({ where: { workspace_id: workspaceId, wa_message_id: m.waMessageId } });
            return { message: again, created: false };
        }
        throw e;
    }
    const isNewest = !conv.last_message_at || createdAt >= conv.last_message_at;
    await prisma.waConversation.update({
        where: { id: conv.id },
        data: {
            ...(isNewest ? {
                last_message_preview: previewOf(m.body, m.mediaType),
                last_message_at: createdAt,
                last_direction: m.direction,
            } : {}),
            ...(m.direction === 'in' && !m.history ? { unread_count: { increment: 1 }, hidden: false } : {}),
        },
    });
    return { message, created: true };
}

/** Texto comparable: WhatsApp recorta espacios y normaliza saltos de línea. */
export const comparableBody = (s) => String(s || '').split('\r\n').join('\n').trim();

/** Un mensaje saliente del bot que el servidor ya había registrado (aún sin id de WhatsApp). */
export async function claimPendingOutbound(workspaceId, conversationId, body, waMessageId) {
    const since = new Date(Date.now() - 2 * 60 * 1000);
    const candidates = await prisma.waMessage.findMany({
        where: {
            workspace_id: workspaceId, conversation_id: conversationId, direction: 'out',
            wa_message_id: null, created_at: { gte: since },
        },
        orderBy: { created_at: 'desc' },
        take: 10,
    });
    const wanted = comparableBody(body);
    const pending = candidates.find((c) => comparableBody(c.body) === wanted);
    if (!pending) return null;
    return prisma.waMessage.update({ where: { id: pending.id }, data: { wa_message_id: waMessageId, status: betterStatus(pending.status, 'sent') } });
}

export async function applyAck(workspaceId, waMessageId, ack) {
    const msg = await prisma.waMessage.findFirst({ where: { workspace_id: workspaceId, wa_message_id: waMessageId } });
    if (!msg) return null;
    const next = betterStatus(msg.status, statusFromAck(ack));
    if (next === msg.status) return msg;
    return prisma.waMessage.update({ where: { id: msg.id }, data: { status: next } });
}

/** Borra imágenes viejas (retención). Devuelve cuántas. */
export async function purgeOldMedia(now = new Date()) {
    const cutoff = new Date(now.getTime() - MEDIA_RETENTION_DAYS * 24 * 3600 * 1000);
    const ids = await prisma.waMedia.findMany({ where: { created_at: { lt: cutoff } }, select: { id: true } });
    if (!ids.length) return 0;
    const list = ids.map((r) => r.id);
    await prisma.waMessage.updateMany({ where: { media_id: { in: list } }, data: { media_id: null } });
    const res = await prisma.waMedia.deleteMany({ where: { id: { in: list } } });
    return res.count;
}

/**
 * Fusiona conversaciones duplicadas del mismo chat de WhatsApp (mismo wa_chat_id). Pasaba cuando un chat @lid se creó primero con su
 * teléfono real y después, sin ese dato, con el id interno. Se conserva la que tiene teléfono real (o la más antigua), se mueven
 * TODOS los mensajes, se suman los no leídos y se recalcula el último mensaje. Idempotente: devuelve cuántas fusionó.
 */
export async function mergeDuplicateConversations(workspaceId) {
    const convs = await prisma.waConversation.findMany({
        where: { workspace_id: workspaceId, wa_chat_id: { not: null } },
        select: { id: true, phone: true, wa_chat_id: true, display_name: true, client_id: true, unread_count: true, hidden: true, created_at: true },
    });
    const groups = new Map();
    for (const c of convs) {
        if (!groups.has(c.wa_chat_id)) groups.set(c.wa_chat_id, []);
        groups.get(c.wa_chat_id).push(c);
    }
    let merged = 0;
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        list.sort((a, b) => (isRealPhone(b.phone) - isRealPhone(a.phone)) || (new Date(a.created_at) - new Date(b.created_at)));
        const [primary, ...others] = list;
        for (const other of others) {
            await prisma.waMessage.updateMany({ where: { conversation_id: other.id }, data: { conversation_id: primary.id } });
            primary.unread_count += other.unread_count || 0;
            primary.display_name = primary.display_name || other.display_name;
            primary.client_id = primary.client_id || other.client_id;
            primary.hidden = primary.hidden && other.hidden;
            await prisma.waConversation.delete({ where: { id: other.id } });
            merged += 1;
        }
        const last = await prisma.waMessage.findFirst({ where: { conversation_id: primary.id }, orderBy: { created_at: 'desc' } });
        await prisma.waConversation.update({
            where: { id: primary.id },
            data: {
                unread_count: primary.unread_count, display_name: primary.display_name, client_id: primary.client_id, hidden: primary.hidden,
                ...(last ? { last_message_preview: previewOf(last.body, last.media_id ? 'image' : null), last_message_at: last.created_at, last_direction: last.direction } : {}),
            },
        });
    }
    return merged;
}

/**
 * Mensaje SALIENTE del historial que el servidor ya tenía registrado sin id de WhatsApp (automático o del panel):
 * se le asigna el id en vez de crear otra copia. Ventana de ±3 minutos y mismo texto.
 */
export async function claimHistoryOutbound(workspaceId, conversationId, body, waMessageId, at) {
    if (!waMessageId) return null;
    const t = at instanceof Date ? at : new Date(at);
    const from = new Date(t.getTime() - 3 * 60 * 1000);
    const to = new Date(t.getTime() + 3 * 60 * 1000);
    const candidates = await prisma.waMessage.findMany({
        where: {
            workspace_id: workspaceId, conversation_id: conversationId, direction: 'out', origin: { in: ['auto', 'panel'] },
            wa_message_id: null, created_at: { gte: from, lte: to },
        },
        take: 20,
    });
    const wanted = comparableBody(body);
    const hit = candidates.find((c) => comparableBody(c.body) === wanted);
    if (!hit) return null;
    return prisma.waMessage.update({ where: { id: hit.id }, data: { wa_message_id: waMessageId, status: betterStatus(hit.status, 'sent') } });
}

/**
 * Borra los mensajes de cliente/teléfono SIN id de WhatsApp de una conversación (importados antes de que se guardara el id: de ahí
 * salieron copias repetidas). Se llama justo después de importar el historial CON ids, que los reemplaza. Devuelve cuántos borró.
 */
export async function purgeUntaggedHistory(workspaceId, conversationId) {
    const res = await prisma.waMessage.deleteMany({
        where: { workspace_id: workspaceId, conversation_id: conversationId, wa_message_id: null, origin: { in: ['client', 'phone'] } },
    });
    return res.count;
}
