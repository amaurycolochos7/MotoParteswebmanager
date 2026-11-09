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
    // Al quedar lista la sesion, se importa el historial reciente (con una pausa para no competir con el arranque).
    client.on('ready', () => {
        setTimeout(() => { importHistory(client, sessionId).catch(() => {}); }, 25000);
    });
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

// ── Importación del historial ────────────────────────────────────────────────
// Al conectar (y cuando se pida a mano) se leen los chats recientes del teléfono para que "Conversaciones" muestre TODO,
// no solo lo que llegue desde ahora. Solo texto y etiquetas de multimedia (no se descargan archivos históricos).
// Nunca debe romper la sesión: cada paso va con tiempo límite y try/catch.
const importing = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(promise, ms, what) {
    let t;
    return Promise.race([
        promise,
        new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} tardó más de ${Math.round(ms / 1000)} s`)), ms); }),
    ]).finally(() => clearTimeout(t));
}

/** ¿Este chat entra al historial? (puro) Solo conversaciones 1 a 1: nada de grupos, estados, difusiones ni canales. */
export function shouldImportChat(chat) {
    if (!chat || chat.isGroup) return false;
    const id = chat.id?._serialized || '';
    const server = chat.id?.server || '';
    if (!id || id.startsWith('status@') || server === 'broadcast' || server === 'newsletter' || server === 'g.us') return false;
    return true;
}

export async function importHistory(client, sessionId, { maxChats = 200, perChat = 60, pauseMs = 200 } = {}) {
    if (importing.has(sessionId)) return { running: true };
    importing.add(sessionId);
    const stats = { chats: 0, messages: 0, errors: 0 };
    try {
        console.log(`📥 [inbox] importando historial de la sesión ${sessionId}…`);
        const all = await withTimeout(client.getChats(), 120000, 'getChats');
        const list = all.filter(shouldImportChat)
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, maxChats);
        for (const chat of list) {
            try {
                const msgs = await withTimeout(chat.fetchMessages({ limit: perChat }), 30000, 'fetchMessages');
                let name = chat.name || null; let numberHint = null;
                try {
                    const c = await withTimeout(chat.getContact(), 10000, 'getContact');
                    name = c?.pushname || c?.name || name;
                    numberHint = c?.number || null;
                } catch { /* sin datos del contacto: la API usa el id del chat */ }
                const items = (msgs || []).filter(shouldForward).map((m) => ({
                    direction: m.fromMe ? 'out' : 'in',
                    body: bodyOf(m),
                    wa_message_id: m.id?._serialized || null,
                    timestamp: m.timestamp || null,
                    mediaType: m.type === 'chat' ? null : m.type,
                })).filter((m) => m.body);
                if (items.length) {
                    await post({ type: 'history', sessionId, chat: { id: chat.id._serialized, name, numberHint }, messages: items });
                    stats.messages += items.length;
                }
                stats.chats += 1;
            } catch (e) {
                stats.errors += 1;
                console.warn(`⚠️ [inbox] historial de un chat falló: ${e.message}`);
            }
            await sleep(pauseMs);
        }
        console.log(`✅ [inbox] historial importado: ${stats.chats} chats, ${stats.messages} mensajes, ${stats.errors} errores`);
    } catch (e) {
        stats.errors += 1;
        console.warn(`⚠️ [inbox] no se pudo importar el historial: ${e.message}`);
    } finally {
        importing.delete(sessionId);
    }
    return stats;
}
