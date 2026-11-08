// Reenvía a la API los mensajes que entran y salen de la sesión de WhatsApp para la bandeja "Conversaciones" (V2).
//
// - `message`         mensajes ENTRANTES de clientes.
// - `message_create`  solo los SALIENTES (fromMe): los enviados por el sistema, por el panel o desde el propio teléfono.
// - `message_ack`     acuses (enviado / entregado / leído) de nuestros mensajes.
//
// Nunca debe romper la sesión: todo va dentro de try/catch y los fallos solo se registran.
const API_URL = (process.env.API_INTERNAL_URL || 'http://api:3000').replace(/\/$/, '');
const API_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';
const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

// Tipos de WhatsApp que NO son conversación (avisos del sistema, llamadas, mensajes eliminados...).
const IGNORED_TYPES = new Set([
    'e2e_notification', 'notification_template', 'call_log', 'protocol', 'gp2', 'broadcast_notification',
    'revoked', 'ciphertext', 'group_notification', 'notification',
]);
const MEDIA_LABELS = {
    image: 'Imagen', video: 'Video', ptt: 'Nota de voz', audio: 'Audio', document: 'Documento',
    sticker: 'Sticker', location: 'Ubicación', vcard: 'Contacto', multi_vcard: 'Contactos',
};

async function post(payload) {
    try {
        const res = await fetch(`${API_URL}/api/internal/wa/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok && res.status !== 404) console.warn(`⚠️ [inbox] la API respondió ${res.status} al evento ${payload.type}`);
    } catch (e) {
        console.warn(`⚠️ [inbox] no se pudo avisar a la API (${payload.type}): ${e.message}`);
    }
}

/** ¿Este mensaje debe ir a la bandeja? (puro, se prueba sin WhatsApp) */
export function shouldForward(msg) {
    if (!msg) return false;
    const chatId = msg.fromMe ? msg.to : msg.from;
    if (!chatId || chatId.endsWith('@g.us') || chatId.startsWith('status@') || chatId.endsWith('@broadcast') || chatId.endsWith('@newsletter')) return false;
    if (msg.isStatus) return false;
    if (IGNORED_TYPES.has(msg.type)) return false;
    return true;
}

/** Texto a guardar: el cuerpo, o una etiqueta si es multimedia sin texto. */
export function bodyOf(msg) {
    const text = String(msg.body || '').trim();
    if (msg.type === 'chat' || msg.type === 'text') return text;
    const label = MEDIA_LABELS[msg.type];
    if (!label) return text;
    // Para multimedia `body` puede traer datos en base64: solo se conserva el pie de foto si existe.
    const caption = String(msg.caption ?? msg._data?.caption ?? '').trim();
    return caption ? `[${label}] ${caption}` : `[${label}]`;
}

async function forward(client, sessionId, msg, direction) {
    if (!shouldForward(msg)) return;
    const chatId = direction === 'in' ? msg.from : msg.to;
    let name = null; let numberHint = null;
    try {
        const contact = direction === 'in' ? await msg.getContact() : await client.getContactById(chatId);
        name = contact?.pushname || contact?.name || null;
        numberHint = contact?.number || null;
    } catch { /* sin datos del contacto: la API usa el id del chat */ }

    let media = null;
    if (msg.hasMedia && msg.type === 'image') {
        try {
            const m = await msg.downloadMedia();
            if (m?.data && Math.ceil(m.data.length * 0.75) <= MAX_MEDIA_BYTES) media = { mime: m.mimetype, base64: m.data };
        } catch (e) {
            console.warn(`⚠️ [inbox] no se pudo descargar la imagen: ${e.message}`);
        }
    }

    await post({
        type: 'message',
        sessionId,
        direction,
        from: msg.from,
        to: msg.to,
        body: bodyOf(msg),
        wa_message_id: msg.id?._serialized || null,
        timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
        name,
        numberHint,
        mediaType: msg.type === 'chat' ? null : msg.type,
        media,
    });
}

/** Engancha los eventos a un cliente de whatsapp-web.js. */
export function attachInboxListeners(client, sessionId) {
    client.on('message', (msg) => {
        forward(client, sessionId, msg, 'in').catch((e) => console.warn(`⚠️ [inbox] mensaje entrante: ${e.message}`));
    });
    client.on('message_create', (msg) => {
        if (!msg.fromMe) return;
        forward(client, sessionId, msg, 'out').catch((e) => console.warn(`⚠️ [inbox] mensaje saliente: ${e.message}`));
    });
    client.on('message_ack', (msg, ack) => {
        if (!msg?.fromMe || !msg.id?._serialized) return;
        post({ type: 'ack', sessionId, wa_message_id: msg.id._serialized, ack }).catch(() => {});
    });
}
