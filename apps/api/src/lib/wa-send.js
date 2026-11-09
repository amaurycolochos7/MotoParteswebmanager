// ÚNICA puerta de salida de mensajes de WhatsApp del servidor (V2).
//
//   sendToClient(workspaceId, phone, text, { origin, sentBy, context })
//
// - Resuelve la sesión única del taller (lib/wa-session.js).
// - Registra el mensaje en la bandeja (origin 'auto' = automático del sistema, 'panel' = escrito por una persona).
// - Si el bot no está listo (reconectando, caído), el mensaje NO se pierde: queda en la cola WaOutbox y un
//   trabajador lo reintenta con espera creciente durante 30 minutos.
import prisma from './prisma.js';
import { toLocal10, toWaNumber, digits } from './phone.js';
import { botCall, resolveSessionId } from './wa-session.js';
import { upsertConversation, recordMessage, betterStatus, storeMedia, isRealPhone } from './wa-inbox.js';

export const RETRY_WINDOW_MS = 30 * 60 * 1000;
const BACKOFF_SECONDS = [15, 30, 60, 120, 240, 480, 900];

/** Espera (ms) antes del siguiente intento, según cuántos intentos fallidos van. */
export function nextDelayMs(failedAttempts) {
    const i = Math.min(Math.max(failedAttempts, 1), BACKOFF_SECONDS.length) - 1;
    return BACKOFF_SECONDS[i] * 1000;
}

/** ¿Un fallo del bot es definitivo (no sirve reintentar) o pasajero? */
export function classifyFailure(result) {
    if (result.unreachable) return 'retry';
    const error = String(result.error || '');
    if (result.status === 400) return 'permanent';
    if (/no est[aá] registrad/i.test(error)) return 'permanent';
    return 'retry';
}

/** Motivo corto compatible con lo que ya mostraba el panel (`wa_failed: <motivo>`). */
export function reasonOf(result) {
    if (result.unreachable || result.status === 503 || result.status === 502 || result.status === 504) return 'whatsapp_desconectado';
    if (result.reason) return result.reason;
    return result.status ? `bot_${result.status}` : String(result.error || 'error');
}

/** Un intento de envío por el bot. Devuelve { ok, messageId, ack, failure?:'retry'|'permanent', reason, error }. */
export async function deliverToBot(workspaceId, waNumber, text, chatId = null) {
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) return { ok: false, failure: 'retry', reason: 'whatsapp_desconectado', error: 'No hay sesión de WhatsApp configurada.' };
    const r = await botCall('/send-message', { method: 'POST', body: { mechanicId: sessionId, phone: waNumber, message: text, ...(chatId ? { chatId } : {}) }, timeoutMs: 25_000 });
    if (r.ok) return { ok: true, messageId: r.data?.messageId || null, ack: r.data?.ack ?? null };
    return { ok: false, failure: classifyFailure(r), reason: reasonOf(r), error: r.error };
}

async function markMessage(messageId, patch) {
    if (!messageId) return;
    try {
        const current = await prisma.waMessage.findUnique({ where: { id: messageId } });
        if (!current) return;
        const data = { ...patch };
        // Si el evento del bot llegó primero y creó otra fila con ese id, se descarta el duplicado (la nuestra manda).
        if (patch.wa_message_id) {
            const dup = await prisma.waMessage.findFirst({
                where: { workspace_id: current.workspace_id, wa_message_id: patch.wa_message_id, id: { not: messageId } },
            });
            if (dup) await prisma.waMessage.delete({ where: { id: dup.id } });
        }
        // 'failed' siempre se aplica; los demás solo avanzan (queued -> sent -> delivered -> read), nunca retroceden.
        if (patch.status && patch.status !== 'failed') data.status = betterStatus(current.status, patch.status);
        await prisma.waMessage.update({ where: { id: messageId }, data });
    } catch (e) {
        console.error('[wa-send] no se pudo actualizar el mensaje', messageId, e.message);
    }
}

/**
 * Envía un mensaje por la sesión del taller.
 * @returns {{ sent:boolean, queued?:boolean, reason?:string, messageId?:string|null, conversationId?:string }}
 */
export async function sendToClient(workspaceId, phone, text, ctx = {}) {
    const local = toLocal10(phone) || digits(phone);
    // Con `ctx.chatId` (p. ej. un chat @lid sin teléfono conocido) se responde por el id REAL del chat, no por un número inventado.
    const chatId = typeof ctx.chatId === 'string' && /^\d+@(lid|c\.us)$/.test(ctx.chatId) ? ctx.chatId : null;
    if ((!local && !chatId) || !text) return { sent: false, reason: 'sin_telefono' };
    const waNumber = toWaNumber(phone);
    const origin = ctx.origin || 'auto';

    // 1) Registrar en la bandeja (si falla, el envío sigue: la bandeja no debe bloquear mensajes).
    let conv = null; let record = null;
    try {
        conv = await upsertConversation(workspaceId, { phone: local });
        record = (await recordMessage(workspaceId, conv, {
            direction: 'out', origin, body: text, status: 'queued', sentBy: ctx.sentBy || null,
        })).message;
    } catch (e) {
        console.error('[wa-send] no se pudo registrar en la bandeja:', e.message);
    }

    // 2) Intentar enviar ahora.
    const r = await deliverToBot(workspaceId, waNumber, text, chatId);
    if (r.ok) {
        await markMessage(record?.id, { wa_message_id: r.messageId || undefined, status: 'sent' });
        return { sent: true, messageId: r.messageId, conversationId: conv?.id, id: record?.id };
    }

    // 3) Falló: definitivo -> fallido; pasajero -> a la cola de reintentos.
    if (r.failure === 'permanent') {
        await markMessage(record?.id, { status: 'failed', error: String(r.error || r.reason).slice(0, 300) });
        return { sent: false, queued: false, reason: r.reason, error: r.error, conversationId: conv?.id, id: record?.id };
    }
    await prisma.waOutbox.create({
        data: {
            workspace_id: workspaceId,
            phone: waNumber,
            body: text,
            kind: origin,
            status: 'pending',
            attempts: 1,
            next_attempt_at: new Date(Date.now() + nextDelayMs(1)),
            last_error: String(r.error || r.reason).slice(0, 300),
            context: { ...(ctx.context || {}), message_id: record?.id || null, sent_by: ctx.sentBy || null, chat_id: chatId },
        },
    });
    return { sent: false, queued: true, reason: r.reason, conversationId: conv?.id, id: record?.id };
}

// ── Trabajador de reintentos ─────────────────────────────────────────────

let sweeping = false;

/** Procesa los envíos pendientes cuya hora llegó. Devuelve { sent, retried, failed }. */
export async function runOutboxSweep(now = new Date()) {
    if (sweeping) return { skipped: true };
    sweeping = true;
    const out = { sent: 0, retried: 0, failed: 0 };
    try {
        const due = await prisma.waOutbox.findMany({
            where: { status: 'pending', next_attempt_at: { lte: now } },
            orderBy: { created_at: 'asc' },
            take: 20,
        });
        for (const row of due) {
            const r = await deliverToBot(row.workspace_id, row.phone, row.body, row.context?.chat_id || null);
            const messageId = row.context?.message_id || null;
            if (r.ok) {
                await prisma.waOutbox.update({ where: { id: row.id }, data: { status: 'sent', sent_at: new Date(), attempts: { increment: 1 }, last_error: null } });
                await markMessage(messageId, { wa_message_id: r.messageId || undefined, status: 'sent', error: null });
                out.sent += 1;
                continue;
            }
            const expired = now.getTime() - new Date(row.created_at).getTime() > RETRY_WINDOW_MS;
            if (r.failure === 'permanent' || expired) {
                await prisma.waOutbox.update({
                    where: { id: row.id },
                    data: { status: 'failed', attempts: { increment: 1 }, last_error: String(r.error || r.reason).slice(0, 300) },
                });
                await markMessage(messageId, { status: 'failed', error: expired ? 'No se pudo enviar en 30 minutos.' : String(r.error || r.reason).slice(0, 300) });
                out.failed += 1;
                continue;
            }
            await prisma.waOutbox.update({
                where: { id: row.id },
                data: { attempts: { increment: 1 }, next_attempt_at: new Date(Date.now() + nextDelayMs(row.attempts + 1)), last_error: String(r.error || r.reason).slice(0, 300) },
            });
            out.retried += 1;
            // Si el bot no responde, no tiene caso intentar el resto ahora (cada intento espera hasta 25 s).
            if (r.reason === 'whatsapp_desconectado') break;
        }
    } finally {
        sweeping = false;
    }
    return out;
}

let timer = null;
/** Arranca el trabajador (cada 15 s). Idempotente. */
export function startOutboxWorker(log = console) {
    if (timer) return;
    timer = setInterval(() => {
        runOutboxSweep().catch((e) => log.error?.(`[wa-outbox] ${e.message}`) ?? console.error('[wa-outbox]', e.message));
    }, 15_000);
    timer.unref?.();
}
export function stopOutboxWorker() { if (timer) { clearInterval(timer); timer = null; } }

/**
 * Deja constancia en la bandeja de un envío que NO pasó por sendToClient (p. ej. un PDF por /send-document).
 * Nunca lanza.
 */
export async function logOutbound(workspaceId, phone, body, { origin = 'panel', sentBy = null, waMessageId = null, status = 'sent' } = {}) {
    try {
        const local = toLocal10(phone) || digits(phone);
        if (!local) return null;
        const conv = await upsertConversation(workspaceId, { phone: local });
        const { message } = await recordMessage(workspaceId, conv, {
            direction: 'out', origin, body, status, sentBy, waMessageId,
        });
        return message;
    } catch (e) {
        console.error('[wa-send] logOutbound:', e.message);
        return null;
    }
}

/** Id de chat real de una conversación (el @lid/@c.us guardado o, si hay teléfono real, el @c.us). null si no se conoce. */
export function chatIdForConversation(conv) {
    if (conv.wa_chat_id && /^\d+@(lid|c\.us)$/.test(conv.wa_chat_id)) return conv.wa_chat_id;
    return isRealPhone(conv.phone) ? `${toWaNumber(conv.phone)}@c.us` : null;
}

/**
 * Nota de voz escrita desde el panel: se guarda el audio (para poder oírlo en la conversación), se manda por el bot
 * (que lo convierte a ogg/opus, el formato de WhatsApp) y se registra el mensaje. No se reintenta: si falla, queda como fallido.
 * @returns {{ sent:boolean, id?:string, reason?:string, error?:string }}
 */
export async function sendVoiceToClient(workspaceId, conv, { base64, mime, seconds }, ctx = {}) {
    const chatId = chatIdForConversation(conv);
    if (!chatId) return { sent: false, reason: 'sin_chat', error: 'No se conoce el chat de WhatsApp de esta conversación.' };
    const mediaId = await storeMedia(workspaceId, { mime: mime || 'audio/webm', base64 });
    if (!mediaId) return { sent: false, reason: 'archivo_invalido', error: 'El audio está vacío o es demasiado grande.' };
    const { message: record } = await recordMessage(workspaceId, conv, {
        direction: 'out', origin: 'panel', body: '[Nota de voz]', mediaId, mediaType: 'ptt', mediaMime: mime || 'audio/webm',
        mediaSeconds: seconds || null, status: 'queued', sentBy: ctx.sentBy || null,
    });
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) {
        await markMessage(record.id, { status: 'failed', error: 'No hay sesión de WhatsApp configurada.' });
        return { sent: false, id: record.id, reason: 'whatsapp_desconectado', error: 'No hay sesión de WhatsApp configurada.' };
    }
    const r = await botCall('/send-voice', { method: 'POST', body: { mechanicId: sessionId, chatId, base64 }, timeoutMs: 60_000 });
    if (r.ok) {
        await markMessage(record.id, { wa_message_id: r.data?.messageId || undefined, status: 'sent' });
        return { sent: true, id: record.id };
    }
    const reason = reasonOf(r);
    await markMessage(record.id, { status: 'failed', error: String(r.error || reason).slice(0, 300) });
    return { sent: false, id: record.id, reason, error: r.error };
}

// Videos que WhatsApp reproduce como video; cualquier otro formato se manda como documento para que no falle.
const PLAYABLE_VIDEO = /^video\/(mp4|quicktime|3gpp)/i;
const FILE_LABELS = { image: 'Imagen', video: 'Video', document: 'Documento' };

/** Cómo se envía un archivo: 'image' | 'video' | 'document' (puro). */
export function fileKindOf(mime, asDocument = false) {
    const m = String(mime || '').toLowerCase();
    if (asDocument) return 'document';
    if (/^image\/(jpeg|jpg|png|webp|gif)/.test(m)) return 'image';
    if (PLAYABLE_VIDEO.test(m)) return 'video';
    return 'document';
}

/** Texto con el que el bot reporta el mensaje (debe coincidir para no duplicarlo): "[Imagen] pie de foto". */
export function fileBody(kind, caption) {
    const c = String(caption || '').trim();
    return c ? `[${FILE_LABELS[kind]}] ${c}` : `[${FILE_LABELS[kind]}]`;
}

/** Nombre de archivo seguro (sin rutas ni caracteres raros). */
export function safeFileName(name, kind) {
    // eslint-disable-next-line no-control-regex
    const clean = String(name || '').replace(/[\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120);
    return clean || (kind === 'image' ? 'imagen.jpg' : kind === 'video' ? 'video.mp4' : 'documento');
}

/**
 * Foto, video o documento escrito desde el panel, con pie de foto opcional. Se guarda la copia (para verlo en la
 * conversación), se manda por el bot y se registra el mensaje. No se reintenta: si falla, queda como fallido.
 * @returns {{ sent:boolean, id?:string, kind?:string, reason?:string, error?:string }}
 */
export async function sendFileToClient(workspaceId, conv, { base64, mime, name, caption, asDocument }, ctx = {}) {
    const chatId = chatIdForConversation(conv);
    if (!chatId) return { sent: false, reason: 'sin_chat', error: 'No se conoce el chat de WhatsApp de esta conversación.' };
    const kind = fileKindOf(mime, asDocument);
    const mimetype = mime || 'application/octet-stream';
    const filename = safeFileName(name, kind);
    const text = String(caption || '').trim().slice(0, 1000);
    const mediaId = await storeMedia(workspaceId, { mime: mimetype, base64 });
    if (!mediaId) return { sent: false, reason: 'archivo_invalido', error: 'El archivo está vacío o es demasiado grande (máximo 12 MB).' };
    const { message: record } = await recordMessage(workspaceId, conv, {
        direction: 'out', origin: 'panel', body: fileBody(kind, text), mediaId, mediaType: kind, mediaMime: mimetype,
        mediaName: kind === 'document' ? filename : null, status: 'queued', sentBy: ctx.sentBy || null,
    });
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) {
        await markMessage(record.id, { status: 'failed', error: 'No hay sesión de WhatsApp configurada.' });
        return { sent: false, id: record.id, kind, reason: 'whatsapp_desconectado', error: 'No hay sesión de WhatsApp configurada.' };
    }
    const r = await botCall('/send-file', {
        method: 'POST',
        body: { mechanicId: sessionId, chatId, base64, mimetype, filename, caption: text, asDocument: kind === 'document' },
        timeoutMs: 90_000,
    });
    if (r.ok) {
        await markMessage(record.id, { wa_message_id: r.data?.messageId || undefined, status: 'sent' });
        return { sent: true, id: record.id, kind };
    }
    const reason = reasonOf(r);
    await markMessage(record.id, { status: 'failed', error: String(r.error || reason).slice(0, 300) });
    return { sent: false, id: record.id, kind, reason, error: r.error };
}
