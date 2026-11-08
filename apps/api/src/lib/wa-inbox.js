// Bandeja de conversaciones de WhatsApp: guardar y consultar mensajes (V2).
// Las funciones reciben SIEMPRE el workspaceId (se pueden llamar desde el webhook del bot o desde trabajos sin
// petición); por eso pasan workspace_id explícito y no dependen del auto-scope.
import prisma from './prisma.js';
import { toLocal10, digits, phoneVariants } from './phone.js';

export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
export const MEDIA_RETENTION_DAYS = 30;

/** Teléfono canónico (10 dígitos MX o dígitos completos) a partir del id de chat de WhatsApp. */
export function phoneFromChat(chatId, hintNumber) {
    const [user, domain] = String(chatId || '').split('@');
    const candidate = domain === 'c.us' ? user : (hintNumber || user);
    return toLocal10(candidate) || digits(candidate);
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
    let conv = await prisma.waConversation.findFirst({ where: { workspace_id: workspaceId, phone } });
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
        if (dup) return { message: dup, created: false };
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
            ...(m.direction === 'in' ? { unread_count: { increment: 1 }, hidden: false } : {}),
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
