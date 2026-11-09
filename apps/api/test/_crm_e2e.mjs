// CRM de WhatsApp: chats por maestro (asignación, secciones, permisos), adjuntos desde el panel y foto de perfil.
// Contra la BD local, con un bot FALSO y dos maestros temporales (se borran al terminar).
//   cd apps/api && DATABASE_URL=postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes node test/_crm_e2e.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';

const API = 3182, BOT = 3188, SECRET = 'local-dev-only-change-me';
const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true, whatsapp_session_profile_id: true } });
const admin = await prisma.profile.findFirst({ where: { memberships: { some: { workspace_id: ws.id, role: { in: ['owner', 'admin'] } } } }, select: { id: true, email: true } });
const sessionId = ws.whatsapp_session_profile_id;
const TAG = `crm${Date.now()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ', m); } else { fail++; console.log('  FAIL ', m); } };
const tokenOf = (p, role) => jwt.sign({ id: p.id, email: p.email, role, workspace_id: ws.id }, SECRET, { expiresIn: '1h' });

// ── bot falso ──
const fileCalls = []; const picCalls = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const bot = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        const body = JSON.parse(b || '{}');
        if (req.url === '/send-file') { fileCalls.push(body); return res.end(JSON.stringify({ messageId: `true_${body.chatId}_FILE${fileCalls.length}`, ack: 1 })); }
        if (req.url.endsWith('/profile-pic')) {
            picCalls.push(body.chatId);
            if (String(body.chatId).includes(PH_NONE)) return res.end(JSON.stringify({ none: true }));
            return res.end(JSON.stringify({ data: PNG.toString('base64'), mime: 'image/png' }));
        }
        res.end(JSON.stringify({ messageId: `true_x_${Date.now()}`, ack: 1 }));
    });
});
await new Promise((r) => bot.listen(BOT, r));

// ── datos de prueba ──
const mk = async (name) => {
    const p = await prisma.profile.create({ data: { email: `${TAG}-${name}@test.local`, full_name: `Maestro ${name}`, is_master_mechanic: true, role: 'mechanic' } });
    await prisma.membership.create({ data: { workspace_id: ws.id, profile_id: p.id, role: 'mechanic' } });
    return p;
};
const A = await mk('Maciel'); const B = await mk('Liu');
const open = await prisma.orderStatus.findFirst({ where: { workspace_id: ws.id, is_terminal: false } });
const PH_A = '9619990001', PH_NONE = '9619990002', PH_B = '9619990003';
const mkClient = (name, phone) => prisma.client.create({ data: { workspace_id: ws.id, full_name: name, phone } });
const cA = await mkClient(`${TAG} Cliente de Maciel`, PH_A);
const cB = await mkClient(`${TAG} Cliente de Liu`, PH_B);
await prisma.order.create({ data: { workspace_id: ws.id, order_number: `${TAG}-A`, client_id: cA.id, mechanic_id: A.id, status_id: open.id } });
await prisma.order.create({ data: { workspace_id: ws.id, order_number: `${TAG}-B`, client_id: cB.id, mechanic_id: B.id, status_id: open.id } });
const mkConv = (phone, name, client) => prisma.waConversation.create({ data: { workspace_id: ws.id, phone, wa_chat_id: `52${phone}@c.us`.replace('5219', '529'), display_name: name, client_id: client?.id || null, last_message_at: new Date(), last_message_preview: 'hola' } });
const convA = await mkConv(PH_A, `${TAG} A`, cA);
const convB = await mkConv(PH_B, `${TAG} B`, cB);
const convN = await mkConv(PH_NONE, `${TAG} N`, null);

const cleanup = async () => {
    const convs = await prisma.waConversation.findMany({ where: { workspace_id: ws.id, phone: { in: [PH_A, PH_B, PH_NONE] } }, select: { id: true, avatar_media_id: true } });
    for (const c of convs) { await prisma.waMessage.deleteMany({ where: { conversation_id: c.id } }); await prisma.waConversation.delete({ where: { id: c.id } }); if (c.avatar_media_id) await prisma.waMedia.deleteMany({ where: { id: c.avatar_media_id } }); }
    await prisma.waMedia.deleteMany({ where: { workspace_id: ws.id, mime: 'image/png', size: PNG.length } }).catch(() => {});
    await prisma.order.deleteMany({ where: { order_number: { startsWith: TAG } } });
    await prisma.client.deleteMany({ where: { full_name: { startsWith: TAG } } });
    await prisma.membership.deleteMany({ where: { profile_id: { in: [A.id, B.id] } } });
    await prisma.profile.deleteMany({ where: { id: { in: [A.id, B.id] } } });
};

const api = spawn('node', ['src/index.js'], { env: { ...process.env, PORT: String(API), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'local-dev-bot-key', WHATSAPP_BOT_INTERNAL_URL: `http://localhost:${BOT}`, LOG_LEVEL: 'silent' }, stdio: 'ignore' });
try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API}/api/health`)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
    const as = (tok) => {
        const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
        return {
            get: (p) => fetch(`http://localhost:${API}/api/inbox${p}`, { headers: H }),
            post: (p, body) => fetch(`http://localhost:${API}/api/inbox${p}`, { method: 'POST', headers: H, body: JSON.stringify(body || {}) }),
        };
    };
    const adm = as(tokenOf(admin, 'admin')); const ma = as(tokenOf(A, 'mechanic')); const li = as(tokenOf(B, 'mechanic'));
    const mine = (j) => (j.items || []).filter((c) => [convA.id, convB.id, convN.id].includes(c.id));

    console.log('== asignación automática por orden abierta');
    let r = await adm.get('/conversations?limit=100'); let j = await r.json();
    const byId = Object.fromEntries(mine(j).map((c) => [c.id, c]));
    ok(byId[convA.id]?.assigned_to?.id === A.id, `chat del cliente de Maciel -> Maciel (${byId[convA.id]?.assigned_to?.full_name})`);
    ok(byId[convB.id]?.assigned_to?.id === B.id, 'chat del cliente de Liu -> Liu');
    ok(byId[convN.id]?.assigned_to === null, 'chat sin cliente ni respuestas -> sin asignar');

    console.log('== secciones y filtros (administrador)');
    r = await adm.get('/sections'); let s = await r.json();
    const sa = s.masters.find((m) => m.id === A.id); const sb = s.masters.find((m) => m.id === B.id);
    ok(r.status === 200 && sa && sb && sa.total >= 1 && sb.total >= 1, 'el administrador ve una sección por cada maestro con su contador');
    ok(s.can_assign === true && s.assignable.length >= 2, 'puede asignar chats');
    j = await (await adm.get(`/conversations?owner=${A.id}&limit=100`)).json();
    ok(mine(j).length === 1 && mine(j)[0].id === convA.id, 'owner=<Maciel> trae solo lo de Maciel');
    j = await (await adm.get('/conversations?owner=none&limit=100')).json();
    ok(mine(j).length === 1 && mine(j)[0].id === convN.id, 'owner=none trae los sin asignar');

    console.log('== un maestro solo ve lo suyo y "todos"');
    j = await (await li.get('/conversations?owner=me&limit=100')).json();
    ok(mine(j).length === 1 && mine(j)[0].id === convB.id, 'Liu: "Mis chats" = solo lo de Liu');
    r = await li.get(`/conversations?owner=${A.id}`);
    ok(r.status === 403, `Liu no puede pedir la sección de Maciel (${r.status})`);
    j = await (await li.get('/conversations?owner=all&limit=100')).json();
    ok(mine(j).length === 3, 'Liu: "Todos" muestra todos los chats');
    s = await (await li.get('/sections')).json();
    ok(s.masters.length === 1 && s.masters[0].id === B.id && s.can_assign === true && s.own_ids[0] === B.id, 'Liu solo recibe su propia sección');

    console.log('== asignar a mano y volver a automático');
    r = await adm.post(`/conversations/${convA.id}/assign`, { profile_id: B.id });
    j = await r.json();
    ok(r.status === 200 && j.assigned_to?.id === B.id && j.assigned_to.manual === true, 'Maciel -> Liu a mano');
    await new Promise((x) => setTimeout(x, 50));
    j = await (await adm.get(`/conversations?owner=${B.id}&limit=100`)).json();
    ok(mine(j).some((c) => c.id === convA.id), 'el chat pasa a la sección de Liu');
    r = await adm.post(`/conversations/${convA.id}/assign`, { profile_id: null });
    j = await r.json();
    ok(j.assigned_to?.id === A.id && j.assigned_to.manual === false, 'sin responsable manual vuelve a Maciel (por su orden)');
    r = await adm.post(`/conversations/${convA.id}/assign`, { profile_id: '00000000-0000-0000-0000-000000000000' });
    ok(r.status === 404, 'asignar a alguien que no es del taller -> 404');

    console.log('== quien responde un chat sin responsable se lo queda');
    r = await li.post(`/conversations/${convN.id}/messages`, { text: 'Hola, soy Liu' });
    ok(r.status === 201, `Liu responde (${r.status})`);
    j = await (await li.get('/conversations?owner=me&limit=100')).json();
    ok(mine(j).some((c) => c.id === convN.id), 'el chat sin responsable queda a cargo de Liu');

    console.log('== adjuntos desde el panel');
    const photo = PNG.toString('base64');
    r = await li.post(`/conversations/${convB.id}/attachment`, { file_base64: photo, mime: 'image/png', name: 'moto.png', caption: 'Así quedó su moto' });
    j = await r.json();
    ok(r.status === 201 && j.media?.type === 'image' && j.body === '[Imagen] Así quedó su moto' && j.status === 'sent', `foto con pie de foto (${r.status} ${j.body})`);
    ok(fileCalls.length === 1 && fileCalls[0].chatId === convB.wa_chat_id && fileCalls[0].caption === 'Así quedó su moto' && fileCalls[0].asDocument === false, 'el bot recibe chat, pie de foto y NO como documento');
    let m = await li.get(`/messages/${j.id}/media`);
    ok(m.status === 200 && Buffer.compare(Buffer.from(await m.arrayBuffer()), PNG) === 0, 'la foto enviada se puede volver a ver');
    r = await li.post(`/conversations/${convB.id}/attachment`, { file_base64: Buffer.from('%PDF-1.4 prueba').toString('base64'), mime: 'application/pdf', name: '../cotización.pdf' });
    j = await r.json();
    ok(r.status === 201 && j.media?.type === 'document' && j.media.name === '.._cotización.pdf' && fileCalls[1].asDocument === true, `PDF como documento, nombre saneado (${j.media?.name})`);
    r = await li.post(`/conversations/${convB.id}/attachment`, { file_base64: Buffer.from('webm').toString('base64'), mime: 'video/webm', name: 'clip.webm' });
    j = await r.json();
    ok(r.status === 201 && j.media?.type === 'document', 'video que WhatsApp no reproduce se manda como documento');
    r = await li.post(`/conversations/${convB.id}/attachment`, { file_base64: '' });
    ok(r.status === 400, 'archivo vacío -> 400');
    r = await li.post(`/conversations/${convB.id}/attachment`, { file_base64: 'A'.repeat(17 * 1024 * 1024 + 4), mime: 'application/pdf' });
    ok(r.status === 413, `archivo enorme -> 413 (${r.status})`);
    const conv = await prisma.waConversation.findUnique({ where: { id: convB.id } });
    ok(/Video|Documento/.test(conv.last_message_preview || ''), `la lista muestra el último archivo (${conv.last_message_preview})`);

    console.log('== foto de perfil de WhatsApp');
    let avatars = null;
    for (let i = 0; i < 20; i++) {
        j = await (await adm.get('/conversations?limit=100')).json();
        avatars = Object.fromEntries(mine(j).map((c) => [c.id, c.avatar]));
        if (avatars[convA.id] && avatars[convB.id]) break;
        await new Promise((x) => setTimeout(x, 700));
    }
    ok(!!avatars[convA.id] && !!avatars[convB.id], 'los chats con foto la reciben en segundo plano');
    ok(avatars[convN.id] === null, 'sin foto (oculta) queda null');
    ok(picCalls.every((c) => /^\d+@(c\.us|lid)$/.test(c)), 'se pidió con el id real del chat');
    const row = await prisma.waConversation.findUnique({ where: { id: convN.id } });
    ok(!!row.avatar_checked_at, 'se registra que ya se revisó (no se vuelve a pedir en cada consulta)');
    const before = picCalls.length;
    await adm.get('/conversations?limit=100'); await new Promise((x) => setTimeout(x, 800));
    ok(picCalls.length === before, 'no se repiten las consultas al bot');
    m = await adm.get(`/conversations/${convA.id}/avatar`);
    ok(m.status === 200 && /image\/png/.test(m.headers.get('content-type')) && Buffer.compare(Buffer.from(await m.arrayBuffer()), PNG) === 0, 'GET /avatar devuelve la imagen');
    m = await adm.get(`/conversations/${convN.id}/avatar`);
    ok(m.status === 404, 'sin foto -> 404 (el panel muestra iniciales)');
    r = await adm.post(`/conversations/${convN.id}/avatar/refresh`);
    j = await r.json();
    ok(r.status === 200 && j.result === 'none', `refrescar a mano responde (${j.result})`);
} finally {
    api.kill(); bot.close();
    await new Promise((x) => setTimeout(x, 300));
    await cleanup().catch((e) => console.log('limpieza:', e.message));
    await prisma.$disconnect();
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
