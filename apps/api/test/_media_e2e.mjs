// Archivos en la bandeja: audios, stickers, imágenes, documentos (bajo demanda), notas de voz desde el panel,
// reemplazo de mensajes viejos sin id y sin duplicar. Contra la BD local, con un bot FALSO.
//   cd apps/api && DATABASE_URL=... node test/_media_e2e.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';
import { handleBotEvent } from '../src/routes/internal-wa.js';

const API = 3181, BOT = 3189, SECRET = 'local-dev-only-change-me';
const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true, whatsapp_session_profile_id: true } });
const admin = await prisma.profile.findFirst({ where: { memberships: { some: { workspace_id: ws.id, role: { in: ['owner', 'admin'] } } } }, select: { id: true, email: true } });
const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin', workspace_id: ws.id }, SECRET, { expiresIn: '1h' });
const sessionId = ws.whatsapp_session_profile_id;
const LID = '444555666777888', CHAT = `${LID}@lid`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ', m); } else { fail++; console.log('  FAIL ', m); } };

const fetchCalls = []; const voiceCalls = [];
const bot = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        const body = JSON.parse(b || '{}');
        if (req.url.endsWith('/fetch-media')) {
            fetchCalls.push(body.waMessageId);
            if (/EXPIRED/.test(body.waMessageId)) return res.end(JSON.stringify({ error: 'expirado' }));
            return res.end(JSON.stringify({ data: Buffer.from('OggS-audio-de-prueba').toString('base64'), mime: 'audio/ogg; codecs=opus', seconds: 9, size: 20 }));
        }
        if (req.url === '/send-voice') { voiceCalls.push(body); return res.end(JSON.stringify({ messageId: 'true_' + CHAT + '_VOICE1', converted: true })); }
        res.end(JSON.stringify({ messageId: 'x', ack: 1 }));
    });
});
await new Promise((r) => bot.listen(BOT, r));
const api = spawn('node', ['src/index.js'], { env: { ...process.env, PORT: String(API), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'local-dev-bot-key', WHATSAPP_BOT_INTERNAL_URL: `http://localhost:${BOT}`, LOG_LEVEL: 'silent' }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const get = (p) => fetch(`http://localhost:${API}/api/inbox${p}`, { headers: H });
const post = (p, body) => fetch(`http://localhost:${API}/api/inbox${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });

const clean = async () => {
    const cs = await prisma.waConversation.findMany({ where: { workspace_id: ws.id, wa_chat_id: CHAT } });
    for (const c of cs) { await prisma.waMessage.deleteMany({ where: { conversation_id: c.id } }); await prisma.waConversation.delete({ where: { id: c.id } }); }
};
await clean();

console.log('== mensajes viejos sin id (importaciones anteriores)');
const conv = await prisma.waConversation.create({ data: { workspace_id: ws.id, phone: LID, wa_chat_id: CHAT, display_name: 'Rosa Archivos' } });
const old = (body, origin, direction, at) => prisma.waMessage.create({ data: { workspace_id: ws.id, conversation_id: conv.id, direction, origin, body, status: 'sent', created_at: new Date(at) } });
const T0 = Date.now() - 3600 * 1000;
await old('Hola viejo 1', 'client', 'in', T0 - 5000); await old('Hola viejo 2', 'phone', 'out', T0 - 4000);
const auto = await old('Su moto ya está lista', 'auto', 'out', T0 + 1000);

console.log('== importación del historial CON ids y archivos');
const ts = (s) => Math.floor((T0 + s * 1000) / 1000);
const msgs = [
    { direction: 'in', body: 'Hola', wa_message_id: `false_${CHAT}_T1`, timestamp: ts(-10), mediaType: null },
    { direction: 'in', body: '[Nota de voz]', wa_message_id: `false_${CHAT}_AUDIO1`, timestamp: ts(5), mediaType: 'ptt', mediaSeconds: 12, mediaMime: 'audio/ogg; codecs=opus' },
    { direction: 'in', body: '[Sticker]', wa_message_id: `false_${CHAT}_STK1`, timestamp: ts(6), mediaType: 'sticker', mediaMime: 'image/webp' },
    { direction: 'in', body: '[Nota de voz]', wa_message_id: `false_${CHAT}_EXPIRED1`, timestamp: ts(7), mediaType: 'ptt', mediaSeconds: 3 },
    { direction: 'out', body: 'Su moto ya está lista', wa_message_id: `true_${CHAT}_OUT1`, timestamp: ts(1), mediaType: null }, // el mismo que registró el servidor
    { direction: 'out', body: '[Documento] Cotización', wa_message_id: `true_${CHAT}_DOC1`, timestamp: ts(9), mediaType: 'document', mediaName: 'cotizacion.pdf', mediaMime: 'application/pdf' },
];
const hev = () => ({ type: 'history', sessionId, chat: { id: CHAT, name: 'Rosa Archivos', numberHint: null }, messages: msgs, replaceUntagged: true });
let r = await handleBotEvent(hev());
ok(r.ok && r.replaced === 2, `reemplaza los 2 mensajes viejos sin id (${JSON.stringify(r)})`);
const all = await prisma.waMessage.findMany({ where: { conversation_id: conv.id }, orderBy: { created_at: 'asc' } });
ok(all.length === 6, `quedan 6 mensajes, sin copias (${all.length})`);
ok(!all.some((m) => /viejo/.test(m.body)), 'los viejos sin id ya no están');
const claimed = all.filter((m) => m.body === 'Su moto ya está lista');
ok(claimed.length === 1 && claimed[0].id === auto.id && claimed[0].wa_message_id === `true_${CHAT}_OUT1` && claimed[0].origin === 'auto', 'el automático del servidor recibió su id (no se duplicó)');
r = await handleBotEvent(hev());
ok(r.ok && r.imported === 0, 'importar otra vez no agrega nada');
ok((await prisma.waMessage.count({ where: { conversation_id: conv.id } })) === 6, 'siguen siendo 6');

console.log('== lista de mensajes con datos de archivo');
const list = (await (await get(`/conversations/${conv.id}/messages?limit=50`)).json()).items;
const ptt = list.find((m) => m.body === '[Nota de voz]' && m.media?.seconds === 12);
ok(ptt && ptt.media.type === 'ptt' && ptt.media.available === false && ptt.media.message_id === ptt.id, 'la nota de voz trae tipo, duración y message_id (aún no descargada)');
const stk = list.find((m) => m.media?.type === 'sticker');
ok(!!stk, 'el sticker se reconoce como sticker');
const doc = list.find((m) => m.media?.type === 'document');
ok(doc && doc.media.name === 'cotizacion.pdf', 'el documento trae su nombre');

console.log('== el archivo se baja de WhatsApp la primera vez y luego sale de la base');
let m = await get(`/messages/${ptt.id}/media`);
ok(m.status === 200 && /audio\/ogg/.test(m.headers.get('content-type') || ''), `1a vez: 200 audio/ogg (${m.status})`);
ok(Buffer.from(await m.arrayBuffer()).toString() === 'OggS-audio-de-prueba', 'con el contenido correcto');
ok(fetchCalls.length === 1 && fetchCalls[0] === `false_${CHAT}_AUDIO1`, 'se pidió al bot con el id completo del mensaje');
m = await get(`/messages/${ptt.id}/media`);
ok(m.status === 200 && fetchCalls.length === 1, '2a vez: sale de la base, sin volver a pedir a WhatsApp');
const after = (await (await get(`/conversations/${conv.id}/messages?limit=50`)).json()).items.find((x) => x.id === ptt.id);
ok(after.media.available === true, 'ahora figura como descargado');
const exp = list.find((x) => x.media?.seconds === 3);
m = await get(`/messages/${exp.id}/media`);
const eb = await m.json();
ok(m.status === 404 && /expir/i.test(eb.error || ''), `archivo expirado: 404 con mensaje claro (${m.status}: ${eb.error})`);

console.log('== nota de voz desde el panel');
const b64 = Buffer.from('webm-grabado-en-el-navegador').toString('base64');
r = await post(`/conversations/${conv.id}/voice`, { audio_base64: b64, mime: 'audio/webm;codecs=opus', seconds: 4 });
const vm = await r.json();
ok(r.status === 201 && vm.media?.type === 'ptt' && vm.media.seconds === 4 && vm.media.available === true, `se envía y queda guardada (${r.status})`);
ok(voiceCalls.length === 1 && voiceCalls[0].chatId === CHAT && voiceCalls[0].base64 === b64, 'el bot recibe el chat real y el audio');
ok(vm.status === 'sent', `estado enviado (${vm.status})`);
m = await get(`/messages/${vm.id}/media`);
ok(m.status === 200 && Buffer.from(await m.arrayBuffer()).toString() === 'webm-grabado-en-el-navegador', 'el audio enviado se puede volver a oír desde el panel');
const empty = await post(`/conversations/${conv.id}/voice`, { audio_base64: '', mime: 'audio/webm' });
ok(empty.status === 400, 'audio vacío -> 400');
const sane = await get(`/messages/00000000-0000-0000-0000-000000000000/media`);
ok(sane.status === 404, 'mensaje inexistente -> 404');

await clean();
bot.close(); api.kill(); await prisma.$disconnect();
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
