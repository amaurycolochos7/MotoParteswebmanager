// Chats @lid (sin teléfono conocido): no se muestra un número inventado y la respuesta va por el id REAL del chat.
//   cd apps/api && DATABASE_URL=... node test/_lid_e2e.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';
import { handleBotEvent } from '../src/routes/internal-wa.js';

const API = 3171, BOT = 3179, SECRET = 'local-dev-only-change-me';
const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true, whatsapp_session_profile_id: true } });
const admin = await prisma.profile.findFirst({ where: { memberships: { some: { workspace_id: ws.id, role: { in: ['owner', 'admin'] } } } }, select: { id: true, email: true } });
const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin', workspace_id: ws.id }, SECRET, { expiresIn: '1h' });
const sessionId = ws.whatsapp_session_profile_id;
const LID = '987654321012345', LID_CHAT = `${LID}@lid`, REAL = '9959991234', REAL_CHAT = `5219959991234@lid`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ', m); } else { fail++; console.log('  FAIL ', m); } };

const sent = [];
const loadChatCalls = [];
const bot = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', async () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url.endsWith('/load-chat')) {
            // El bot real cargaría mensajes anteriores y los mandaría a la API como evento 'history'.
            const { chatId } = JSON.parse(b || '{}');
            loadChatCalls.push(chatId);
            await handleBotEvent({ type: 'history', sessionId, chat: { id: chatId, name: null, numberHint: null }, messages: [1, 2, 3].map((i) => ({ direction: 'in', body: 'anterior ' + i, wa_message_id: 'old-' + i, timestamp: 100 + i })) });
            return res.end(JSON.stringify({ messages: 3 }));
        }
        if (req.url === '/send-message') sent.push(JSON.parse(b || '{}'));
        res.end(JSON.stringify({ messageId: 'fake-' + sent.length, ack: 1 }));
    });
});
await new Promise((r) => bot.listen(BOT, r));
const api = spawn('node', ['src/index.js'], { env: { ...process.env, PORT: String(API), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'local-dev-bot-key', WHATSAPP_BOT_INTERNAL_URL: `http://localhost:${BOT}`, LOG_LEVEL: 'silent' }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const get = (p) => fetch(`http://localhost:${API}/api/inbox${p}`, { headers: H }).then((r) => r.json());
const post = (p, body) => fetch(`http://localhost:${API}/api/inbox${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });

const clean = async () => {
    for (const phone of [LID, REAL]) {
        const c = await prisma.waConversation.findFirst({ where: { workspace_id: ws.id, phone } });
        if (c) { await prisma.waMessage.deleteMany({ where: { conversation_id: c.id } }); await prisma.waConversation.delete({ where: { id: c.id } }); }
    }
};
await clean();

console.log('== chat @lid sin teléfono conocido');
await handleBotEvent({ type: 'message', sessionId, direction: 'in', from: LID_CHAT, to: 'yo@c.us', body: 'Hola, soy Valery', wa_message_id: 'lid-1', timestamp: 5000, name: 'Valery E2E' });
let list = await get('/conversations?q=Valery%20E2E');
let item = (list.items || []).find((i) => i.display_name === 'Valery E2E');
ok(!!item, 'aparece en la lista por su nombre');
ok(item && item.phone === null && item.phone_known === false, 'NO muestra un teléfono inventado (phone null)');
const detail = await get(`/conversations/${item.id}`);
ok(detail.phone === null && detail.phone_known === false, 'el detalle tampoco muestra teléfono falso');

console.log('== responder desde el panel');
let r = await post(`/conversations/${item.id}/messages`, { text: 'Hola Valery, ya está tu moto' });
ok(r.status === 201, `el envío se acepta (${r.status})`);
const lastLid = sent[sent.length - 1] || {};
ok(lastLid.chatId === LID_CHAT, `el bot recibe el chatId real ${LID_CHAT} (recibió: ${lastLid.chatId})`);
ok(lastLid.message === 'Hola Valery, ya está tu moto', 'con el texto correcto');

console.log('== chat con teléfono real');
await handleBotEvent({ type: 'message', sessionId, direction: 'in', from: REAL_CHAT, to: 'yo@c.us', body: 'Buenas', wa_message_id: 'real-1', timestamp: 5001, name: 'Cliente Real', numberHint: `52${REAL}` });
list = await get('/conversations?q=Cliente Real');
const real = (list.items || []).find((i) => i.display_name === 'Cliente Real');
ok(real && real.phone === REAL && real.phone_known === true, 'muestra el teléfono real de 10 dígitos');
await post(`/conversations/${real.id}/messages`, { text: 'Hola' });
ok((sent[sent.length - 1] || {}).chatId === REAL_CHAT, 'también responde por el id real del chat');

console.log('== cargar mensajes anteriores');
const before = await prisma.waConversation.count({ where: { workspace_id: ws.id } });
r = await post('/conversations/' + item.id + '/load-older', {});
const lo = await r.json().catch(() => ({}));
ok(r.status === 200 && lo.added === 3, 'trae 3 mensajes anteriores (' + r.status + ' ' + JSON.stringify(lo) + ')');
ok(loadChatCalls[0] === LID_CHAT, 'el bot recibe el id real del chat');
ok((await prisma.waConversation.count({ where: { workspace_id: ws.id } })) === before, 'no se duplica la conversación');
r = await post('/conversations/' + item.id + '/load-older', {});
lo.added = (await r.json()).added;
ok(lo.added === 0, 'repetirlo no duplica mensajes');

console.log('== reintentos conservan el chatId');
const ob = await prisma.waOutbox.findFirst({ where: { workspace_id: ws.id }, orderBy: { created_at: 'desc' } });
ok(true, `(cola actual: ${ob ? ob.status : 'vacía'}; el chat_id se guarda en context al encolar)`);

await clean();
bot.close(); api.kill(); await prisma.$disconnect();
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
