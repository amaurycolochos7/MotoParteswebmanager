// Prueba de la API con el evento 'history' contra la BD local.
//   cd apps/api && DATABASE_URL=postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes node test/_history_e2e.mjs
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { handleBotEvent } from '../src/routes/internal-wa.js';

const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true, whatsapp_session_profile_id: true } });
assert.ok(ws, 'el taller local necesita whatsapp_session_profile_id (arranca la API una vez para que corra la migración)');
const sessionId = ws.whatsapp_session_profile_id;
const PHONE = '9959990001';
const CHAT = `52${PHONE}@c.us`;
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass += 1; console.log('  PASS ', m); };

const clean = async () => {
    const conv = await prisma.waConversation.findFirst({ where: { workspace_id: ws.id, phone: PHONE } });
    if (conv) {
        await prisma.waMessage.deleteMany({ where: { conversation_id: conv.id } });
        await prisma.waConversation.delete({ where: { id: conv.id } });
    }
};
await clean();

const ev = (messages, extra = {}) => ({ type: 'history', sessionId, chat: { id: CHAT, name: 'Cliente Historial', numberHint: `52${PHONE}` }, messages, ...extra });
const msgs = [
    { direction: 'out', body: 'Segundo (nuestro)', wa_message_id: 'h-2', timestamp: 2000, mediaType: null },
    { direction: 'in', body: 'Primero (cliente)', wa_message_id: 'h-1', timestamp: 1000, mediaType: null },
    { direction: 'in', body: '[Imagen]', wa_message_id: 'h-3', timestamp: 3000, mediaType: 'image' },
];

console.log('== historial');
const r1 = await handleBotEvent(ev(msgs));
ok(r1.ok && r1.imported === 3, 'importa 3 mensajes');
let conv = await prisma.waConversation.findFirst({ where: { workspace_id: ws.id, phone: PHONE } });
ok(conv && conv.display_name === 'Cliente Historial', 'crea la conversación con el nombre del contacto');
ok(conv.unread_count === 0, 'el historial NO cuenta como no leído');
ok(conv.last_message_preview === '[Imagen]' || /Imagen/.test(conv.last_message_preview || ''), 'el resumen es el mensaje más reciente');
const stored = await prisma.waMessage.findMany({ where: { conversation_id: conv.id }, orderBy: { created_at: 'asc' } });
ok(stored.map((m) => m.wa_message_id).join(',') === 'h-1,h-2,h-3', 'se guardan en orden cronológico con su fecha original');
ok(stored.find((m) => m.wa_message_id === 'h-2').origin === 'phone' && stored.find((m) => m.wa_message_id === 'h-1').origin === 'client', 'origen: cliente / teléfono');

console.log('== idempotencia');
const r2 = await handleBotEvent(ev(msgs));
ok(r2.ok && r2.imported === 0, 'importar otra vez no duplica nada');
ok((await prisma.waMessage.count({ where: { conversation_id: conv.id } })) === 3, 'siguen siendo 3 mensajes');

console.log('== mensajes nuevos siguen contando como no leídos');
const live = await handleBotEvent({ type: 'message', sessionId, direction: 'in', from: CHAT, to: 'yo@c.us', body: 'Hola, ¿siguen abiertos?', wa_message_id: 'live-1', timestamp: 4000, name: 'Cliente Historial' });
ok(live.ok, 'llega un mensaje nuevo en vivo');
conv = await prisma.waConversation.findFirst({ where: { workspace_id: ws.id, phone: PHONE } });
ok(conv.unread_count === 1, 'el mensaje nuevo sí suma 1 no leído');

console.log('== historial viejo no pisa el resumen de lo reciente');
await handleBotEvent(ev([{ direction: 'in', body: 'Muy viejo', wa_message_id: 'h-0', timestamp: 500, mediaType: null }]));
conv = await prisma.waConversation.findFirst({ where: { workspace_id: ws.id, phone: PHONE } });
ok(/siguen abiertos/.test(conv.last_message_preview || ''), 'el resumen sigue siendo el mensaje más reciente');
ok(conv.unread_count === 1, 'y no cambia el contador');

console.log('== chats que se ignoran');
const g = await handleBotEvent({ type: 'history', sessionId, chat: { id: '123@g.us', name: 'Grupo' }, messages: msgs });
ok(g.ignored === true, 'un grupo se ignora');
const s = await handleBotEvent({ type: 'history', sessionId, chat: { id: 'status@broadcast' }, messages: msgs });
ok(s.ignored === true, 'los estados se ignoran');
const bad = await handleBotEvent({ type: 'history', sessionId: 'no-existe', chat: { id: CHAT }, messages: msgs });
ok(bad.ok === false && bad.status === 404, 'una sesión desconocida se rechaza');

await clean();
await prisma.$disconnect();
console.log(`\n${pass} PASS, 0 FAIL`);
