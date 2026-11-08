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
import { upsertConversation, recordMessage, betterStatus } from './wa-inbox.js';

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
export async function deliverToBot(workspaceId, waNumber, text) {
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) return { ok: false, failure: 'retry', reason: 'whatsapp_desconectado', error: 'No hay sesión de WhatsApp configurada.' };
    const r = await botCall('/send-message', { method: 'POST', body: { mechanicId: sessionId, phone: waNumber, message: text }, timeoutMs: 25_000 });
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
    if (!local || !text) return { sent: false, reason: 'sin_telefono' };
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
    const r = await deliverToBot(workspaceId, waNumber, text);
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
            context: { ...(ctx.context || {}), message_id: record?.id || null, sent_by: ctx.sentBy || null },
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
            const r = await deliverToBot(row.workspace_id, row.phone, row.body);
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
