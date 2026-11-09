// Importación del historial en el bot (sin WhatsApp real): cliente falso + fetch falso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importHistory, shouldImportChat } from '../../whatsapp-bot/src/inbox-events.js';

// El código bajo prueba escribe mucho en consola; el ejecutor de pruebas de Node puede confundirse con ese volumen.
console.log = () => {};
console.warn = () => {};

const chat = (over = {}) => ({
    id: { _serialized: '5219611234567@c.us', server: 'c.us' }, isGroup: false, timestamp: 100, name: 'Juan',
    fetchMessages: async () => [
        { id: { _serialized: 'm1' }, fromMe: false, from: '5219611234567@c.us', to: 'yo@c.us', type: 'chat', body: 'Hola', timestamp: 10 },
        { id: { _serialized: 'm2' }, fromMe: true, from: 'yo@c.us', to: '5219611234567@c.us', type: 'chat', body: 'Buenas', timestamp: 20 },
        { id: { _serialized: 'm3' }, fromMe: false, from: '5219611234567@c.us', to: 'yo@c.us', type: 'e2e_notification', body: '', timestamp: 30 },
    ],
    getContact: async () => ({ pushname: 'Juan P', number: '5219611234567' }),
    ...over,
});

function captureFetch() {
    const sent = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; };
    return { sent, restore: () => { globalThis.fetch = original; } };
}

test('shouldImportChat: solo chats 1 a 1', () => {
    assert.equal(shouldImportChat(chat()), true);
    assert.equal(shouldImportChat(chat({ isGroup: true })), false);
    assert.equal(shouldImportChat(chat({ id: { _serialized: 'status@broadcast', server: 'broadcast' } })), false);
    assert.equal(shouldImportChat(chat({ id: { _serialized: '1@newsletter', server: 'newsletter' } })), false);
    assert.equal(shouldImportChat(null), false);
});

test('importHistory manda un evento por chat con mensajes limpios, ordenados por recencia', async () => {
    const cap = captureFetch();
    try {
        const client = { getChats: async () => [
            chat({ timestamp: 5, id: { _serialized: '111@c.us', server: 'c.us' } }),
            chat({ timestamp: 99, id: { _serialized: '222@c.us', server: 'c.us' } }),
            chat({ isGroup: true, timestamp: 200, id: { _serialized: 'g@g.us', server: 'g.us' } }),
        ] };
        const stats = await importHistory(client, 'sesion-1', { pauseMs: 0 });
        assert.equal(stats.chats, 2);
        assert.equal(stats.messages, 4); // 2 válidos por chat (se descarta el aviso del sistema)
        assert.equal(cap.sent.length, 2);
        assert.equal(cap.sent[0].chat.id, '222@c.us'); // el más reciente primero
        assert.equal(cap.sent[0].type, 'history');
        assert.deepEqual(cap.sent[0].messages.map((m) => [m.direction, m.body]), [['in', 'Hola'], ['out', 'Buenas']]);
        assert.equal(cap.sent[0].chat.numberHint, '5219611234567');
    } finally { cap.restore(); }
});

test('importHistory respeta el tope de chats y no se rompe si un chat falla', async () => {
    const cap = captureFetch();
    try {
        const client = { getChats: async () => [
            chat({ timestamp: 3, id: { _serialized: '1@c.us', server: 'c.us' }, fetchMessages: async () => { throw new Error('boom'); } }),
            chat({ timestamp: 2, id: { _serialized: '2@c.us', server: 'c.us' } }),
            chat({ timestamp: 1, id: { _serialized: '3@c.us', server: 'c.us' } }),
        ] };
        const stats = await importHistory(client, 'sesion-2', { maxChats: 2, pauseMs: 0 });
        // el chat que falla con la librería se intenta por el almacén (aquí vacío): no es un error ni rompe nada
        assert.equal(stats.errors, 0);
        assert.equal(cap.sent.length, 1); // 3 -> solo 2 por el tope; el primero no trajo mensajes
    } finally { cap.restore(); }
});

test('importHistory no corre dos veces a la vez para la misma sesión', async () => {
    const cap = captureFetch();
    try {
        let release;
        const gate = new Promise((r) => { release = r; });
        const client = { getChats: async () => { await gate; return [chat()]; } };
        const first = importHistory(client, 'sesion-3', { pauseMs: 0 });
        const second = await importHistory(client, 'sesion-3', { pauseMs: 0 });
        assert.deepEqual(second, { running: true });
        release();
        await first;
    } finally { cap.restore(); }
});

test('importHistory devuelve errores en las estadísticas si WhatsApp no responde, sin lanzar', async () => {
    const cap = captureFetch();
    try {
        const stats = await importHistory({ getChats: async () => { throw new Error('sin conexión'); } }, 'sesion-4', { pauseMs: 0 });
        assert.equal(stats.errors, 1);
        assert.equal(stats.chats, 0);
    } finally { cap.restore(); }
});

// ── Camino por el almacén de WhatsApp Web (el que funciona con la versión fija) ──
test('importHistory lee los chats del almacén cuando getChats() no sirve', async () => {
    const cap = captureFetch();
    try {
        let call = 0;
        const client = {
            getChats: async () => { throw new Error('r'); }, // como en producción
            getChatById: async () => { throw new Error('no disponible'); },
            pupPage: {
                // 1a llamada: lista de chats; siguientes: mensajes de un chat
                evaluate: async (_fn, id) => {
                    call += 1;
                    if (call === 1) return [
                        { id: '5219611111111@c.us', server: 'c.us', user: '5219611111111', isGroup: false, name: 'Ana', t: 50, phone: null },
                        { id: '1203@g.us', server: 'g.us', user: '1203', isGroup: true, name: 'Grupo', t: 90, phone: null },
                        { id: '1234@lid', server: 'lid', user: '1234', isGroup: false, name: 'Luis', t: 10, phone: '5219622222222' },
                    ];
                    return [
                        { sid: `m-${id}-1`, fromMe: false, type: 'chat', body: 'Hola desde el almacén', caption: '', t: 5 },
                        { sid: `m-${id}-2`, fromMe: true, type: 'image', body: 'BASE64BASURA', caption: 'foto del escape', t: 6 },
                    ];
                },
            },
        };
        const stats = await importHistory(client, 'sesion-store', { pauseMs: 0 });
        assert.equal(stats.source, 'almacén');
        assert.equal(stats.chats, 2); // el grupo no entra
        assert.equal(stats.messages, 4);
        assert.equal(cap.sent[0].chat.id, '5219611111111@c.us'); // el más reciente primero
        assert.equal(cap.sent[1].chat.numberHint, '5219622222222'); // chat @lid: usa el teléfono del contacto
        assert.deepEqual(cap.sent[0].messages.map((m) => m.body), ['Hola desde el almacén', '[Imagen] foto del escape']);
        assert.ok(!cap.sent[0].messages.some((m) => /BASURA/.test(m.body)), 'no se guarda el base64 de la miniatura');
    } finally { cap.restore(); }
});

test('importHistory cae a getChats() si el almacén no está disponible', async () => {
    const cap = captureFetch();
    try {
        const client = { getChats: async () => [chat({ timestamp: 7, id: { _serialized: '9@c.us', server: 'c.us' } })] };
        const stats = await importHistory(client, 'sesion-fallback', { pauseMs: 0 });
        assert.equal(stats.source, 'getChats');
        assert.equal(stats.chats, 1);
    } finally { cap.restore(); }
});

test('importHistory acepta la respuesta con carga de mensajes anteriores y pide deep en los primeros chats', async () => {
    const cap = captureFetch();
    try {
        const deepFlags = [];
        let call = 0;
        const client = {
            getChats: async () => { throw new Error('r'); },
            getChatById: async () => { throw new Error('no disponible'); },
            pupPage: {
                evaluate: async (_fn, id, _n, deep) => {
                    call += 1;
                    if (call === 1) return [{ id: '5219613333333@c.us', server: 'c.us', user: '5219613333333', isGroup: false, name: 'Rosa', t: 9, phone: null }];
                    deepFlags.push(deep);
                    return { deep: 'rondas=2 total=30', msgs: Array.from({ length: 30 }, (_, i) => ({ sid: `d-${i}`, fromMe: i % 2 === 0, type: 'chat', body: `mensaje ${i}`, caption: '', t: 100 + i })) };
                },
            },
        };
        const stats = await importHistory(client, 'sesion-deep', { pauseMs: 0 });
        assert.equal(stats.messages, 30);
        assert.deepEqual(deepFlags, [true]); // el primer chat pide carga profunda
        assert.equal(cap.sent[0].messages.length, 30);
    } finally { cap.restore(); }
});
