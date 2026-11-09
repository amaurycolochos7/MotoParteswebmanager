// Importación del historial en el bot (sin WhatsApp real): cliente falso + fetch falso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importHistory, shouldImportChat } from '../../whatsapp-bot/src/inbox-events.js';

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
        assert.equal(stats.errors, 1);
        assert.equal(cap.sent.length, 1); // 3 -> solo 2 por el tope; uno falló
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
