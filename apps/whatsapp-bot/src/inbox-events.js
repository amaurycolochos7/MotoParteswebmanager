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
//
// Cómo se leen los chats (en este orden, porque `client.getChats()` falla con la versión fija de WhatsApp Web que usamos):
//   1) directo del almacén interno de WhatsApp Web (`WAWebCollections`), el mismo camino que ya usa `recentMessages`;
//   2) `client.getChats()` de la librería, como respaldo.
// Y los mensajes de cada chat: primero `fetchMessages` de la librería (puede cargar más) y, si falla o viene vacío,
// lo que ya está cargado en el almacén.
const importing = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(promise, ms, what) {
    let t;
    return Promise.race([
        promise,
        new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} tardó más de ${Math.round(ms / 1000)} s`)), ms); }),
    ]).finally(() => clearTimeout(t));
}
const errText = (e) => `${e?.message || e}${e?.stack ? ' | ' + String(e.stack).split('\n').slice(1, 3).join(' ').trim().slice(0, 200) : ''}`;

/** ¿Este chat entra al historial? (puro) Solo conversaciones 1 a 1: nada de grupos, estados, difusiones ni canales. */
export function shouldImportChat(chat) {
    if (!chat || chat.isGroup) return false;
    const id = chat.id?._serialized || '';
    const server = chat.id?.server || '';
    if (!id || id.startsWith('status@') || server === 'broadcast' || server === 'newsletter' || server === 'g.us') return false;
    return true;
}

/** Lista de chats directo del almacén de WhatsApp Web. Devuelve objetos con la forma mínima que usa la importación. */
async function listChatsFromStore(client) {
    if (!client?.pupPage?.evaluate) throw new Error('sin página de WhatsApp Web');
    const rows = await withTimeout(client.pupPage.evaluate(() => {
        const chats = window.require('WAWebCollections').Chat.getModelsArray();
        return chats.map((c) => ({
            id: c.id && c.id._serialized,
            server: c.id && c.id.server,
            user: c.id && c.id.user,
            isGroup: !!c.isGroup,
            name: c.name || c.formattedTitle || (c.contact && (c.contact.name || c.contact.pushname)) || null,
            t: c.t || 0,
            phone: (c.contact && c.contact.phoneNumber && c.contact.phoneNumber.user) || null,
        })).filter((c) => c.id);
    }), 60000, 'lectura del almacén de chats');
    return rows.map((r) => ({
        id: { _serialized: r.id, server: r.server, user: r.user },
        isGroup: r.isGroup, name: r.name, timestamp: r.t,
        _store: { phone: r.phone },
    }));
}

/**
 * Mensajes de un chat directo del almacén. Con `deep` intenta antes cargar mensajes anteriores (equivale a hacer
 * scroll hacia arriba en WhatsApp Web) hasta tener `limit`; si ese módulo no existe en la versión fija, sigue con lo ya cargado.
 */
let deepNote = null; // primer resultado/errores de la carga profunda, se registra una vez
async function messagesFromStore(client, chatId, limit, deep = false) {
    if (!client?.pupPage?.evaluate) return [];
    const res = await withTimeout(client.pupPage.evaluate(async (id, n, wantDeep) => {
        const wid = window.require('WAWebWidFactory').createWid(id);
        const chat = window.require('WAWebCollections').Chat.get(wid);
        if (!chat) return { msgs: [], deep: null };
        let deepInfo = null;
        if (wantDeep) {
            try {
                const mod = window.require('WAWebChatLoadMessages');
                let rounds = 0;
                while (chat.msgs.length < n && rounds < 8) {
                    rounds += 1;
                    const more = await mod.loadEarlierMsgs(chat);
                    if (!more || !more.length) break;
                }
                deepInfo = 'rondas=' + rounds + ' total=' + chat.msgs.length;
            } catch (e) {
                deepInfo = 'ERR ' + String((e && e.message) || e).slice(0, 120);
            }
        }
        const msgs = chat.msgs.getModelsArray().slice(-n).map((m) => ({
            sid: m.id && m.id._serialized,
            fromMe: !!(m.id ? m.id.fromMe : m.fromMe),
            type: m.type,
            body: typeof m.body === 'string' ? m.body : '',
            caption: typeof m.caption === 'string' ? m.caption : '',
            t: m.t,
        }));
        return { msgs, deep: deepInfo };
    }, chatId, limit, deep), deep ? 45000 : 30000, 'lectura de mensajes del almacén');
    const rows = Array.isArray(res) ? res : (res?.msgs || []);
    if (!Array.isArray(res) && res?.deep && !deepNote) { deepNote = res.deep; console.log(`📥 [inbox] carga de mensajes anteriores (primer chat): ${res.deep}`); }
    return rows.map((m) => ({
        id: { _serialized: m.sid }, fromMe: m.fromMe, type: m.type, body: m.body, caption: m.caption, timestamp: m.t,
        from: m.fromMe ? 'yo@c.us' : chatId, to: m.fromMe ? chatId : 'yo@c.us',
    }));
}

let libErrorLogged = false;
async function messagesOf(client, chat, perChat, deep = false) {
    const chatId = chat.id._serialized;
    try {
        const real = typeof chat.fetchMessages === 'function' ? chat : await client.getChatById(chatId);
        const msgs = await withTimeout(real.fetchMessages({ limit: perChat }), 30000, 'fetchMessages');
        if (Array.isArray(msgs) && msgs.length > 1) return msgs;
    } catch (e) {
        if (!libErrorLogged) { libErrorLogged = true; console.warn(`⚠️ [inbox] fetchMessages de la librería no sirve (${errText(e)}); se usa el almacén`); }
    }
    return messagesFromStore(client, chatId, perChat, deep);
}

export async function importHistory(client, sessionId, { maxChats = 200, perChat = 60, pauseMs = 200 } = {}) {
    if (importing.has(sessionId)) return { running: true };
    importing.add(sessionId);
    const stats = { chats: 0, messages: 0, errors: 0, source: null };
    try {
        console.log(`📥 [inbox] importando historial de la sesión ${sessionId}…`);
        let all;
        try {
            all = await listChatsFromStore(client);
            stats.source = 'almacén';
        } catch (e1) {
            console.warn(`⚠️ [inbox] no se pudo leer el almacén de chats (${errText(e1)}); se intenta getChats()`);
            all = await withTimeout(client.getChats(), 120000, 'getChats');
            stats.source = 'getChats';
        }
        const list = all.filter(shouldImportChat)
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, maxChats);
        console.log(`📥 [inbox] ${all.length} chats encontrados (${stats.source}); se importan ${list.length}`);
        let loggedChatError = false;
        for (const chat of list) {
            try {
                const msgs = await messagesOf(client, chat, perChat, stats.chats < 120);
                let name = chat.name || null;
                let numberHint = chat._store?.phone || null;
                if (typeof chat.getContact === 'function') {
                    try {
                        const c = await withTimeout(chat.getContact(), 10000, 'getContact');
                        name = c?.pushname || c?.name || name;
                        numberHint = c?.number || numberHint;
                    } catch { /* sin datos del contacto: la API usa el id del chat */ }
                }
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
                if (!loggedChatError) { loggedChatError = true; console.warn(`⚠️ [inbox] historial de un chat falló: ${errText(e)}`); }
            }
            await sleep(pauseMs);
        }
        console.log(`✅ [inbox] historial importado: ${stats.chats} chats, ${stats.messages} mensajes, ${stats.errors} errores (fuente: ${stats.source})`);
    } catch (e) {
        stats.errors += 1;
        console.warn(`⚠️ [inbox] no se pudo importar el historial: ${errText(e)}`);
    } finally {
        importing.delete(sessionId);
    }
    return stats;
}
