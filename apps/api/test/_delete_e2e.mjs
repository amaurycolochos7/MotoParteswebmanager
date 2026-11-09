// Eliminar mensajes (para mí / para todos) y mensajes eliminados por el contacto. BD local + bot FALSO.
//   cd apps/api && DATABASE_URL=postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes node test/_delete_e2e.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';
import { handleBotEvent } from '../src/routes/internal-wa.js';

const API = 3183, BOT = 3187, SECRET = 'local-dev-only-change-me';
const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true, whatsapp_session_profile_id: true } });
const admin = await prisma.profile.findFirst({ where: { memberships: { some: { workspace_id: ws.id, role: { in: ['owner', 'admin'] } } } }, select: { id: true, email: true } });
const sessionId = ws.whatsapp_session_profile_id;
const TAG = `del${Date.now()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ', m); } else { fail++; console.log('  FAIL ', m); } };
const tok = (p, role) => jwt.sign({ id: p.id, email: p.email, role, workspace_id: ws.id }, SECRET, { expiresIn: '1h' });

let botMode = 'ok'; const deleteCalls = [];
const bot = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        const body = JSON.parse(b || '{}');
        if (req.url.endsWith('/delete-message')) {
            deleteCalls.push(body);
            if (botMode === 'offline') { res.statusCode = 503; return res.end(JSON.stringify({ error: 'Sesión de WhatsApp no disponible' })); }
            if (botMode === 'old') return res.end(JSON.stringify({ error: 'no_permitido' }));
            return res.end(JSON.stringify({ ok: true }));
        }
        res.end(JSON.stringify({ messageId: 'x', ack: 1 }));
    });
});
await new Promise((r) => bot.listen(BOT, r));

const mkProfile = async (name, master) => {
    const p = await prisma.profile.create({ data: { email: `${TAG}-${name}@test.local`, full_name: `${master ? 'Maestro' : 'Mecanico'} ${name}`, is_master_mechanic: master, role: 'mechanic' } });
    await prisma.membership.create({ data: { workspace_id: ws.id, profile_id: p.id, role: 'mechanic', permissions: { can_view_inbox: true } } });
    return p;
};
const M1 = await mkProfile('Uno', true); const M2 = await mkProfile('Dos', true); const ME = await mkProfile('Tres', false);
const PH = '9618880001', CHAT = `52${PH}@c.us`;
const conv = await prisma.waConversation.create({ data: { workspace_id: ws.id, phone: PH, wa_chat_id: CHAT, display_name: `${TAG} Chat`, last_message_at: new Date(), last_message_preview: 'hola' } });
const now = Date.now();
const mk = (body, o = {}) => prisma.waMessage.create({ data: {
    workspace_id: ws.id, conversation_id: conv.id, direction: 'out', origin: 'panel', body, status: 'delivered',
    created_at: new Date(now - (o.age ?? 60000)),
    wa_message_id: o.wa === null ? null : (o.wa || `true_${CHAT}_${TAG}${body.replace(/\W/g, '')}`),
    sent_by: o.by === undefined ? M1.id : o.by, ...(o.rest || {}),
} });
const mIn = await mk('Hola del cliente', { by: null, rest: { direction: 'in', origin: 'client' }, age: 300000 });
const mA = await mk('Mensaje A', { age: 200000 });
const mB = await mk('Mensaje B', { age: 180000 });
const mOld = await mk('Mensaje viejo', { age: 3 * 24 * 3600 * 1000 });
const mFail = await mk('No salio', { wa: null, rest: { status: 'failed' }, age: 100000 });
const mLast = await mk('Ultimo mensaje', { age: 1000 });
const media = await prisma.waMedia.create({ data: { workspace_id: ws.id, mime: 'image/png', size: 4, data: Buffer.from('test') } });
const mImg = await mk('[Imagen] foto', { age: 90000, rest: { media_id: media.id, media_type: 'image', media_mime: 'image/png' } });

await prisma.waConversation.update({ where: { id: conv.id }, data: { last_message_at: mLast.created_at } }); // la conversación termina en su último mensaje, como en datos reales
const cleanup = async () => {
    await prisma.waMessage.deleteMany({ where: { conversation_id: conv.id } });
    await prisma.waConversation.delete({ where: { id: conv.id } }).catch(() => {});
    await prisma.waMedia.deleteMany({ where: { id: media.id } });
    await prisma.membership.deleteMany({ where: { profile_id: { in: [M1.id, M2.id, ME.id] } } });
    await prisma.profile.deleteMany({ where: { id: { in: [M1.id, M2.id, ME.id] } } });
};
const api = spawn('node', ['src/index.js'], { env: { ...process.env, PORT: String(API), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'local-dev-bot-key', WHATSAPP_BOT_INTERNAL_URL: `http://localhost:${BOT}`, LOG_LEVEL: 'silent' }, stdio: 'ignore' });
try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API}/api/health`)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
    const as = (t) => {
        const H = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
        return {
            get: (p) => fetch(`http://localhost:${API}/api/inbox${p}`, { headers: H }),
            post: (p, b) => fetch(`http://localhost:${API}/api/inbox${p}`, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }),
        };
    };
    const adm = as(tok(admin, 'admin')); const m1 = as(tok(M1, 'mechanic')); const m2 = as(tok(M2, 'mechanic')); const me = as(tok(ME, 'mechanic'));
    const list = async (c) => (await (await c.get(`/conversations/${conv.id}/messages?limit=100`)).json()).items;
    const find = (items, id) => items.find((x) => x.id === id);
    const del = async (c, ids, scope) => { const r = await c.post('/messages/delete', { ids, scope }); return { status: r.status, ...(await r.json()) }; };

    console.log('== can_revoke según quién consulta');
    let items = await list(m1);
    ok(find(items, mA.id).can_revoke === true && find(items, mIn.id).can_revoke === false && find(items, mOld.id).can_revoke === false, 'maestro: sí en lo suyo reciente; no en el del cliente ni en el de hace 3 días');
    ok(find(await list(me), mA.id).can_revoke === false, 'un mecánico no puede eliminar para todos lo que escribió otro');

    console.log('== eliminar PARA MÍ');
    let r = await del(m1, [mA.id, mIn.id], 'me');
    ok(r.status === 200 && r.results.every((x) => x.ok), 'se elimina para mí (también un mensaje del cliente)');
    ok(!find(await list(m1), mA.id) && !find(await list(m1), mIn.id), 'ya no lo ve quien lo eliminó');
    ok(!!find(await list(m2), mA.id) && !!find(await list(adm), mIn.id), 'el resto del equipo SÍ lo sigue viendo');
    ok(deleteCalls.length === 0, 'no se llamó a WhatsApp');
    r = await del(m1, [mA.id], 'me');
    ok(r.results[0].ok, 'repetirlo no falla');

    console.log('== eliminar PARA TODOS');
    r = await del(m1, [mB.id], 'everyone');
    ok(r.results[0].ok && deleteCalls.length === 1 && deleteCalls[0].waMessageId === mB.wa_message_id && deleteCalls[0].everyone === true, 'el bot recibe el id del mensaje');
    items = await list(m2);
    const b = find(items, mB.id);
    ok(b.revoked === true && b.body === '' && b.media === null && b.can_revoke === false, 'queda como eliminado y sin contenido');
    ok((await prisma.waMessage.findUnique({ where: { id: mB.id } })).revoked_by === M1.id, 'se guarda quién lo eliminó');
    r = await del(m1, [mB.id], 'everyone');
    ok(r.results[0].ok && deleteCalls.length === 1, 'eliminar uno ya eliminado no vuelve a llamar a WhatsApp');

    console.log('== reglas y errores');
    r = await del(m1, [mOld.id], 'everyone');
    ok(!r.results[0].ok && /demasiado tiempo/.test(r.results[0].error) && deleteCalls.length === 1, 'pasó la ventana de WhatsApp: se rechaza sin llamar al bot');
    r = await del(m1, [mIn.id], 'everyone');
    ok(!r.results[0].ok && /enviaste/.test(r.results[0].error), 'un mensaje del cliente no se elimina para todos');
    r = await del(me, [mLast.id], 'everyone');
    ok(!r.results[0].ok, 'un mecánico no elimina para todos lo de otro');
    botMode = 'offline';
    r = await del(m1, [mLast.id], 'everyone');
    ok(!r.results[0].ok && /no está conectado/.test(r.results[0].error), 'WhatsApp desconectado: error claro');
    ok(!(await prisma.waMessage.findUnique({ where: { id: mLast.id } })).revoked_at, 'y el mensaje NO se marca como eliminado');
    botMode = 'old';
    r = await del(m1, [mLast.id], 'everyone');
    ok(!r.results[0].ok && /permite/.test(r.results[0].error), 'WhatsApp rechaza (ya no permite): se informa');
    botMode = 'ok';

    console.log('== mensaje que nunca salió (fallido) y con archivo');
    const before = deleteCalls.length;
    r = await del(m1, [mFail.id], 'everyone');
    ok(r.results[0].ok && deleteCalls.length === before, 'un fallido se elimina solo aquí, sin llamar a WhatsApp');
    r = await del(m1, [mImg.id], 'everyone');
    ok(r.results[0].ok && !(await prisma.waMedia.findUnique({ where: { id: media.id } })), 'al eliminar una foto también se borra su archivo');

    console.log('== varios a la vez, con un error en medio');
    r = await del(adm, [mLast.id, '00000000-0000-0000-0000-000000000000', mOld.id], 'everyone');
    ok(r.results[0].ok && !r.results[1].ok && !r.results[2].ok, 'cada uno se evalúa por separado');
    r = await m1.post('/messages/delete', { ids: [], scope: 'me' });
    ok(r.status === 400, 'sin mensajes -> 400');

    console.log('== vista previa de la lista');
    const c1 = await prisma.waConversation.findUnique({ where: { id: conv.id } });
    ok(c1.last_message_preview === 'Eliminaste este mensaje', `el último eliminado deja "${c1.last_message_preview}"`);

    console.log('== el contacto elimina un mensaje para todos (evento del bot)');
    const mc = await mk('Se arrepintió', { by: null, rest: { direction: 'in', origin: 'client' }, age: 500 });
    let ev = await handleBotEvent({ type: 'revoke', sessionId, wa_message_id: mc.wa_message_id });
    ok(ev.ok && ev.revoked === true, 'el evento marca el mensaje');
    const rc = find(await list(adm), mc.id);
    ok(rc.revoked === true && rc.body === '' && rc.direction === 'in', 'se ve como "Se eliminó este mensaje"');
    ev = await handleBotEvent({ type: 'revoke', sessionId, wa_message_id: 'no-existe', alt_ids: [mc.wa_message_id] });
    ok(ev.ok, 'también se reconoce por los ids alternos y es idempotente');
    ev = await handleBotEvent({ type: 'revoke', sessionId, wa_message_id: 'desconocido' });
    ok(ev.ok && ev.revoked === false, 'un id desconocido se ignora sin error');
} finally {
    api.kill(); bot.close();
    await new Promise((x) => setTimeout(x, 300));
    await cleanup().catch((e) => console.log('limpieza:', e.message));
    await prisma.$disconnect();
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
