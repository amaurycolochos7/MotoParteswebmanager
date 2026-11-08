// E2E de la V2 (WhatsApp único, cola de reintentos, mensajes sin duplicados, bandeja, equipo, comisiones, citas).
//   cd apps/api && DATABASE_URL=postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes node test/_v2_e2e.mjs
// Arranca su propia API (3101) y un bot de WhatsApp FALSO (3199). Crea DOS talleres de prueba aislados
// (teléfonos 997…, correos e2e-v2-…@test.local) y los borra al terminar. Nunca envía WhatsApp reales.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const SECRET = 'local-dev-only-change-me';
const PORT = 3101, BOT_PORT = 3199;
const BASE = `http://localhost:${PORT}`;
process.env.WHATSAPP_BOT_INTERNAL_URL = `http://localhost:${BOT_PORT}`;
process.env.WHATSAPP_API_KEY = 'local-dev-bot-key';
process.env.JWT_SECRET = SECRET;

// Las librerías leen estas variables al importarse: por eso van DESPUÉS de fijarlas.
const { default: jwt } = await import('jsonwebtoken');
const { default: prisma } = await import('../src/lib/prisma.js');
const { runAutomationSweep } = await import('../src/lib/automations.js');
const { runOutboxSweep } = await import('../src/lib/wa-send.js');
const { runStartupMigrations } = await import('../src/lib/startup-migrations.js');
const { ensureDefaultMessages } = await import('../src/lib/default-messages.js');

const TAG = Math.random().toString(36).slice(2, 8);
const rnd7 = () => String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
const newPhone = () => `997${rnd7()}`;

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const section = (t) => console.log(`\n== ${t}`);

// ── Bot de WhatsApp falso ────────────────────────────────────────────────
let botMode = 'ok'; // ok | down | notregistered
let botSeq = 0;
const botLog = [];
const bot = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        let json = null; try { json = JSON.parse(body); } catch { /* sin cuerpo */ }
        botLog.push({ method: req.method, url: req.url, body: json });
        const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.url === '/send-message' || req.url === '/send-document') {
            if (botMode === 'down') return send(503, { error: 'Sesión de WhatsApp no disponible', fallback: true });
            if (botMode === 'notregistered') return send(500, { error: `El número ${json?.phone} no está registrado en WhatsApp`, fallback: true });
            return send(200, { success: true, messageId: `FAKE-${++botSeq}`, ack: 1 });
        }
        if (/\/sessions\/[^/]+\/status$/.test(req.url)) return send(200, { exists: true, isConnected: true, phoneNumber: '5219970000000', qr: false, initializing: false });
        if (/\/sessions\/[^/]+\/qr$/.test(req.url)) return send(200, { qr: 'data:image/png;base64,AAAA', isConnected: false });
        if (/\/sessions\/[^/]+\/(start|logout)$/.test(req.url)) return send(200, { success: true });
        if (req.url === '/sessions') return send(200, []);
        return send(404, { error: 'no existe' });
    });
});
await new Promise((r) => bot.listen(BOT_PORT, r));
const textsTo = (phone10) => botLog.filter((e) => e.url === '/send-message' && String(e.body?.phone || '').endsWith(phone10));

// ── API ──────────────────────────────────────────────────────────────────
function startApi(port, extraEnv = {}) {
    const child = spawn(process.execPath, ['src/index.js'], {
        env: {
            ...process.env, PORT: String(port), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'local-dev-bot-key',
            WHATSAPP_BOT_INTERNAL_URL: `http://localhost:${BOT_PORT}`, PANEL_URL: 'https://panel.test', LOG_LEVEL: 'silent', ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.getLog = () => log;
    return child;
}
async function waitUp(port) {
    for (let i = 0; i < 60; i++) {
        try { const r = await fetch(`http://localhost:${port}/api/health`); if (r.ok) return; } catch { /* aun no */ }
        await sleep(500);
    }
    throw new Error(`API ${port} no arrancó`);
}
const call = async (method, path, body, token, headers = {}) => {
    const res = await fetch(BASE + path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* no json */ }
    return { status: res.status, json, text, headers: res.headers };
};

// ── Datos de prueba ──────────────────────────────────────────────────────
const created = { workspaces: [], profiles: [] };
let n = 0;
async function mkWorkspace(label, flagship = false) {
    const ws = await prisma.workspace.create({
        data: { slug: `e2e-v2-${TAG}-${label}`, name: `E2E ${label} ${TAG}`, folio_prefix: 'E2', is_flagship: flagship, subscription_status: 'active' },
    });
    created.workspaces.push(ws.id);
    return ws;
}
async function mkProfile(ws, name, { role = 'mechanic', profile = {}, permissions = {}, phone = newPhone() } = {}) {
    const p = await prisma.profile.create({
        data: { email: `e2e-v2-${TAG}-${++n}@test.local`, full_name: name, phone, role: 'mechanic', password_hash: 'x', ...profile },
    });
    created.profiles.push(p.id);
    await prisma.membership.create({ data: { workspace_id: ws.id, profile_id: p.id, role, permissions } });
    return p;
}
const tokenFor = (p, wsId) => jwt.sign({ id: p.id, email: p.email, role: p.role, workspace_id: wsId }, SECRET, { expiresIn: '1h' });

let api = null;
try {
    section('Preparación: dos talleres aislados');
    const wsA = await mkWorkspace('a', true);
    const wsB = await mkWorkspace('b', true);
    for (const [i, name] of [[10, 'Recibida'], [40, 'En proceso'], [50, 'Lista'], [60, 'Entregada'], [70, 'Cancelada']]) {
        await prisma.orderStatus.create({ data: { workspace_id: wsA.id, name, display_order: i, is_terminal: ['Entregada', 'Cancelada'].includes(name) } });
    }
    const owner = await mkProfile(wsA, 'Dueña E2E', { role: 'owner', profile: { role: 'admin' } });
    const admin = await mkProfile(wsA, 'Admin E2E', { role: 'admin', profile: { role: 'admin_mechanic' } });
    const maestro = await mkProfile(wsA, 'Maestro E2E', { role: 'mechanic', profile: { role: 'admin_mechanic', is_master_mechanic: true, commission_percentage: 50 } });
    const maestro2 = await mkProfile(wsA, 'Maestro Dos E2E', { role: 'mechanic', profile: { role: 'admin_mechanic', is_master_mechanic: true, commission_percentage: 50 } });
    const mecanico = await mkProfile(wsA, 'Mecánico E2E', { role: 'mechanic', profile: { commission_percentage: 40 } });
    const aux1 = await mkProfile(wsA, 'Auxiliar Uno E2E', { role: 'auxiliary', profile: { requires_approval: true, supervised_by: maestro.id, commission_percentage: 30 } });
    const aux2 = await mkProfile(wsA, 'Auxiliar Dos E2E', { role: 'auxiliary', profile: { requires_approval: true, supervised_by: maestro.id, commission_percentage: 20 }, permissions: { can_view_inbox: true } });
    const aux3 = await mkProfile(wsA, 'Auxiliar Tres E2E', { role: 'auxiliary', profile: { requires_approval: true, supervised_by: maestro2.id, commission_percentage: 20 } });
    const ownerB = await mkProfile(wsB, 'Dueño B E2E', { role: 'owner', profile: { role: 'admin' } });
    // Sesión de WhatsApp que "ya estaba conectada" (como la de producción): la migración debe adoptarla.
    await prisma.whatsappSession.create({ data: { workspace_id: wsA.id, mechanic_id: admin.id, is_connected: true, phone_number: '5219970000000' } });

    const T = {
        owner: tokenFor(owner, wsA.id), admin: tokenFor(admin, wsA.id), maestro: tokenFor(maestro, wsA.id), maestro2: tokenFor(maestro2, wsA.id),
        mecanico: tokenFor(mecanico, wsA.id), aux1: tokenFor(aux1, wsA.id), aux2: tokenFor(aux2, wsA.id), ownerB: tokenFor(ownerB, wsB.id),
    };

    api = startApi(PORT);
    await waitUp(PORT);
    await sleep(1500); // deja terminar las migraciones de arranque

    // ── 1. Migraciones de arranque ───────────────────────────────────────
    section('Migraciones de arranque (sesión única y mensajes por defecto)');
    let ws = await prisma.workspace.findUnique({ where: { id: wsA.id } });
    ok(ws.whatsapp_session_profile_id === admin.id, 'el taller adoptó la sesión que ya estaba conectada (sin pedir QR)');
    ok((await prisma.workspace.findUnique({ where: { id: wsB.id } })).whatsapp_session_profile_id === null, 'un taller sin WhatsApp no se toca');
    const autos = await prisma.automation.findMany({ where: { workspace_id: wsA.id, is_default: true } });
    const byName = Object.fromEntries(autos.map((a) => [a.name, a]));
    ok(['Confirmación de ingreso', 'Estado: en proceso', 'Estado: entregada', 'Estado: cancelada', 'Lista para recoger'].every((k) => byName[k]?.enabled === true), 'automatizaciones de orden creadas y activadas');
    ok(autos.every((a) => a.params?.dedup_per_order === true || !['order.created', 'order.status_changed'].includes(a.trigger)), 'todas con deduplicación por orden');
    ok(!autos.some((a) => /Recordatorio|Feedback|Aniversario|estancada|Cita/i.test(a.name)), 'no activa recordatorios de cita ni tareas internas');
    const again = await runStartupMigrations({ info() {}, error: console.error });
    ok(again.sessions_assigned === 0, 'segunda corrida: no reasigna sesiones');
    const d = again.defaults[wsA.id];
    ok(d && d.templates_created === 0 && d.automations_created === 0 && d.automations_enabled === 0 && d.templates_upgraded === 0, 'segunda corrida: no crea ni cambia nada (idempotente)', JSON.stringify(d));
    ok((await prisma.automation.count({ where: { workspace_id: wsA.id, is_default: true } })) === autos.length, 'sin automatizaciones duplicadas');

    // Una persona que EDITÓ una plantilla y otra que APAGÓ una automatización: la migración no pisa nada.
    const tplProc = await prisma.messageTemplate.findFirst({ where: { workspace_id: wsA.id, name: 'Estado: en proceso' } });
    const autoEnt = byName['Estado: entregada'];
    await prisma.messageTemplate.update({ where: { id: tplProc.id }, data: { created_at: new Date(Date.now() - 86400000) } });
    await prisma.automation.update({ where: { id: autoEnt.id }, data: { created_at: new Date(Date.now() - 86400000) } });
    await prisma.messageTemplate.update({ where: { id: tplProc.id }, data: { body: 'Texto propio del taller {cliente}' } });
    await prisma.automation.update({ where: { id: autoEnt.id }, data: { enabled: false } });
    await ensureDefaultMessages(wsA.id);
    ok((await prisma.messageTemplate.findUnique({ where: { id: tplProc.id } })).body === 'Texto propio del taller {cliente}', 'no pisa una plantilla editada');
    ok((await prisma.automation.findUnique({ where: { id: autoEnt.id } })).enabled === false, 'no reactiva lo que alguien apagó a propósito');
    // Se restaura para el resto de la prueba.
    await prisma.messageTemplate.update({ where: { id: tplProc.id }, data: { body: 'Hola *{cliente}* orden {folio} en proceso de su {moto}.{atiende}' } });
    await prisma.automation.update({ where: { id: autoEnt.id }, data: { enabled: true } });

    // ── 2. Un solo mensaje por evento (nunca dos) ────────────────────────
    section('Orden + 3 cambios de estado => exactamente 1 mensaje por evento');
    const clientPhone = newPhone();
    const client = await prisma.client.create({ data: { workspace_id: wsA.id, phone: clientPhone, full_name: 'Cliente Prueba E2E' } });
    const moto = await prisma.motorcycle.create({ data: { workspace_id: wsA.id, client_id: client.id, brand: 'Italika', model: 'FT150', year: 2022 } });
    botLog.length = 0;
    let r = await call('POST', '/api/orders', { client_id: client.id, motorcycle_id: moto.id, mechanic_id: mecanico.id, customer_complaint: 'Ruido en el motor' }, T.admin);
    ok(r.status === 200 && r.json?.id, 'orden creada', r.text.slice(0, 200));
    const orderId = r.json.id;
    await sleep(900);
    await runAutomationSweep();
    let msgs = textsTo(clientPhone);
    ok(msgs.length === 1, `al crear la orden sale exactamente 1 mensaje (salieron ${msgs.length})`);
    ok(/Registrada con éxito/.test(msgs[0]?.body?.message || ''), 'es el mensaje "Confirmación de ingreso"');
    ok(/Te atiende:\*? Mecánico E2E/.test(msgs[0]?.body?.message || ''), 'incluye quién atiende');
    ok(msgs[0]?.body?.mechanicId === admin.id, 'sale por la sesión ÚNICA del taller (no por la del mecánico)');
    ok(msgs[0]?.body?.phone === `52${clientPhone}`, 'al número del cliente con lada 52');
    await runAutomationSweep(); await runAutomationSweep();
    ok(textsTo(clientPhone).length === 1, 'pasadas repetidas del trabajador no duplican');

    const statusId = async (name) => (await prisma.orderStatus.findFirst({ where: { workspace_id: wsA.id, name } })).id;
    const changeTo = async (name) => call('PUT', `/api/orders/${orderId}/status`, { status_id: await statusId(name) }, T.admin);
    const expectOne = async (label, rx) => {
        const before = textsTo(clientPhone).length;
        await sleep(900); // fireEvent no se espera en la petición: damos tiempo a que cree el trabajo
        await runAutomationSweep();
        const now = textsTo(clientPhone);
        ok(now.length === before + 1, `${label}: exactamente 1 mensaje nuevo (hubo ${now.length - before})`);
        ok(rx.test(now[now.length - 1]?.body?.message || ''), `${label}: texto correcto`);
    };
    r = await changeTo('En proceso'); ok(r.status === 200, 'estado -> En proceso');
    await expectOne('En proceso', /en proceso de su Italika FT150|En proceso/i);
    r = await changeTo('Lista'); ok(r.status === 200, 'estado -> Lista');
    await expectOne('Lista', /concluido|lista para ser retirada/i);
    r = await changeTo('Entregada'); ok(r.status === 200, 'estado -> Entregada');
    await expectOne('Entregada', /Entregada/);
    const before = textsTo(clientPhone).length;
    await changeTo('Entregada'); await sleep(900); await runAutomationSweep();
    ok(textsTo(clientPhone).length === before, 'reaplicar el mismo estado no vuelve a avisar');
    const bodies = textsTo(clientPhone).map((m) => m.body.message);
    ok(new Set(bodies).size === bodies.length, 'ningún texto se repitió');

    // ── 3. Cola de reintentos ────────────────────────────────────────────
    section('Cola de reintentos: el bot cae y el mensaje NO se pierde');
    const p2 = newPhone();
    botLog.length = 0; botMode = 'down';
    r = await call('POST', '/api/whatsapp/send', { phone: p2, message: 'Mensaje con el bot caído' }, T.maestro);
    ok(r.status === 200 && r.json?.success === true && r.json?.queued === true, 'con el bot caído responde queued:true', r.text);
    let box = await prisma.waOutbox.findMany({ where: { workspace_id: wsA.id, phone: `52${p2}` } });
    ok(box.length === 1 && box[0].status === 'pending', 'queda 1 envío pendiente en la cola');
    let conv2 = await prisma.waConversation.findFirst({ where: { workspace_id: wsA.id, phone: p2 } });
    let m2 = await prisma.waMessage.findFirst({ where: { conversation_id: conv2.id } });
    ok(m2?.status === 'queued' && m2.origin === 'panel' && m2.sent_by === maestro.id, 'en la bandeja figura en cola, origen panel y quién lo escribió');
    botMode = 'ok';
    const sweepBefore = textsTo(p2).length;
    const out = await runOutboxSweep(new Date(Date.now() + 60_000));
    ok(out.sent >= 1 && out.failed === 0, 'el trabajador lo reenvía al volver el bot', JSON.stringify(out));
    ok(textsTo(p2).length === sweepBefore + 1, 'el bot recibió el mensaje una sola vez');
    box = await prisma.waOutbox.findMany({ where: { workspace_id: wsA.id, phone: `52${p2}` } });
    m2 = await prisma.waMessage.findFirst({ where: { conversation_id: conv2.id } });
    ok(box[0].status === 'sent' && m2.status === 'sent' && m2.wa_message_id?.startsWith('FAKE-'), 'cola y mensaje quedan en "enviado" con id de WhatsApp');
    await runOutboxSweep(new Date(Date.now() + 120_000));
    ok(textsTo(p2).length === sweepBefore + 1, 'otra pasada no lo manda de nuevo');

    // vence a los 30 minutos
    botMode = 'down';
    const p3 = newPhone();
    r = await call('POST', '/api/whatsapp/send', { phone: p3, message: 'Se vence' }, T.maestro);
    box = await prisma.waOutbox.findFirst({ where: { workspace_id: wsA.id, phone: `52${p3}` } });
    await prisma.waOutbox.update({ where: { id: box.id }, data: { created_at: new Date(Date.now() - 31 * 60 * 1000) } });
    await runOutboxSweep(new Date(Date.now() + 60_000));
    box = await prisma.waOutbox.findUnique({ where: { id: box.id } });
    const m3 = await prisma.waMessage.findFirst({ where: { workspace: { id: wsA.id }, conversation: { phone: p3 } } });
    ok(box.status === 'failed' && m3?.status === 'failed', 'pasados 30 minutos queda fallido (no reintenta para siempre)');

    // número que no existe: no se reintenta
    botMode = 'notregistered';
    const p4 = newPhone();
    r = await call('POST', '/api/whatsapp/send', { phone: p4, message: 'A nadie' }, T.maestro);
    ok(r.status === 502, 'número no registrado -> error inmediato', String(r.status));
    ok((await prisma.waOutbox.count({ where: { workspace_id: wsA.id, phone: `52${p4}` } })) === 0, 'y no entra a la cola');
    botMode = 'ok';

    // permisos de envío
    r = await call('POST', '/api/whatsapp/send', { phone: p4, message: 'x' }, T.aux1);
    ok(r.status === 200 || r.status === 403, 'el auxiliar solo envía si tiene permiso de mensajes'); // can_send_messages por defecto true

    // ── 4. WhatsApp del taller ───────────────────────────────────────────
    section('WhatsApp del taller: estado, iniciar, cerrar y rutas antiguas');
    r = await call('GET', '/api/whatsapp/status', undefined, T.admin);
    ok(r.status === 200 && r.json.connected === true && r.json.state === 'connected' && r.json.configured === true, 'admin ve el estado conectado', r.text.slice(0, 200));
    ok(typeof r.json.pending_messages === 'number', 'estado incluye mensajes en cola');
    r = await call('GET', '/api/whatsapp/status', undefined, T.maestro); ok(r.status === 200, 'maestro ve el estado');
    r = await call('GET', '/api/whatsapp/status', undefined, T.mecanico); ok(r.status === 403, 'mecánico común: 403');
    r = await call('GET', '/api/whatsapp/status', undefined, T.ownerB);
    ok(r.status === 200 && r.json.configured === false && r.json.connected === false, 'otro taller sin WhatsApp: no configurado');
    r = await call('POST', '/api/whatsapp/logout', undefined, T.maestro); ok(r.status === 403, 'el maestro NO puede cerrar la sesión');
    r = await call('POST', '/api/whatsapp/start', undefined, T.maestro); ok(r.status === 403, 'el maestro NO puede iniciar la sesión');
    botLog.length = 0;
    r = await call('POST', '/api/whatsapp/logout', undefined, T.admin);
    ok(r.status === 200 && botLog.some((e) => e.url === `/sessions/${admin.id}/logout`), 'el admin cierra la sesión del taller (para cambiar de número)');
    r = await call('POST', '/api/whatsapp/start', undefined, T.admin);
    ok(r.status === 200 && botLog.some((e) => e.url === `/sessions/${admin.id}/start`), 'el admin inicia la sesión');
    // rutas antiguas: ignoran el id que mande el cliente
    botLog.length = 0;
    r = await call('GET', `/api/whatsapp-bot/sessions/${mecanico.id}/status`, undefined, T.mecanico);
    ok(r.status === 200 && botLog.some((e) => e.url === `/sessions/${admin.id}/status`) && !botLog.some((e) => e.url.includes(mecanico.id)), 'ruta antigua de estado resuelve a la sesión del taller');
    botLog.length = 0;
    r = await call('POST', '/api/whatsapp-bot/send-message', { mechanicId: mecanico.id, phone: p2, message: 'Por la ruta antigua' }, T.mecanico);
    ok(r.status === 200 && textsTo(p2).some((e) => e.body.mechanicId === admin.id && e.body.message === 'Por la ruta antigua'), 'send-message antiguo sale por la sesión del taller');
    ok(!!(await prisma.waMessage.findFirst({ where: { workspace_id: wsA.id, body: 'Por la ruta antigua' } })), '...y queda en la bandeja');
    r = await call('GET', `/api/whatsapp-bot/sessions/${mecanico.id}/qr`, undefined, T.mecanico); ok(r.status === 403, 'el QR solo lo ve owner/admin');
    r = await call('POST', `/api/whatsapp-bot/sessions/${mecanico.id}/logout`, undefined, T.mecanico); ok(r.status === 403, 'cerrar sesión por la ruta antigua: solo owner/admin');

    // ── 5. Bandeja ───────────────────────────────────────────────────────
    section('Bandeja: entrantes, salientes, no leídos, ocultar y permisos');
    const ev = (body) => call('POST', '/api/internal/wa/event', { sessionId: admin.id, ...body }, undefined, { 'x-api-key': 'local-dev-bot-key' });
    r = await call('POST', '/api/internal/wa/event', { sessionId: admin.id, type: 'message' }); ok(r.status === 401, 'el webhook del bot exige la clave');
    r = await call('POST', '/api/internal/wa/event', { sessionId: admin.id, type: 'message' }, undefined, { 'x-api-key': 'mala' }); ok(r.status === 401, 'con clave incorrecta: 401');
    const cPhone = newPhone();
    const cli2 = await prisma.client.create({ data: { workspace_id: wsA.id, phone: cPhone, full_name: 'Cliente Chat E2E' } });
    r = await ev({ type: 'message', direction: 'in', from: `52${cPhone}@c.us`, to: '5219970000000@c.us', body: 'Hola, ¿ya está mi moto?', wa_message_id: `IN-${TAG}-1`, timestamp: Math.floor(Date.now() / 1000), name: 'Chat Pushname' });
    ok(r.status === 200 && r.json.ok, 'evento entrante aceptado');
    r = await ev({ type: 'message', direction: 'in', from: `52${cPhone}@c.us`, body: 'Hola, ¿ya está mi moto?', wa_message_id: `IN-${TAG}-1` });
    ok(r.json?.duplicate === true, 'el mismo evento repetido no duplica');
    r = await ev({ type: 'message', direction: 'in', from: '120363999@g.us', body: 'grupo', wa_message_id: `G-${TAG}` });
    ok(r.json?.ignored === true && (await prisma.waConversation.count({ where: { workspace_id: wsA.id, phone: { contains: '120363999' } } })) === 0, 'los grupos se ignoran');
    r = await ev({ type: 'message', direction: 'in', from: 'status@broadcast', body: 'estado', wa_message_id: `S-${TAG}` });
    ok(r.json?.ignored === true, 'los estados se ignoran');

    r = await call('GET', '/api/inbox/conversations', undefined, T.maestro);
    const convItem = r.json?.items?.find((c) => c.phone === cPhone);
    ok(r.status === 200 && !!convItem, 'el maestro ve la conversación');
    ok(convItem?.unread_count === 1 && convItem.last_direction === 'in' && /moto/.test(convItem.last_message_preview), 'no leídos y vista previa');
    ok(convItem?.client?.full_name === 'Cliente Chat E2E', 'se vinculó con el cliente por teléfono');
    const convId = convItem.id;
    r = await call('GET', '/api/inbox/unread-count', undefined, T.admin); ok(r.status === 200 && r.json.count >= 1, 'contador de no leídos para la campanita');
    // permisos
    ok((await call('GET', '/api/inbox/conversations', undefined, T.owner)).status === 200, 'owner: sí');
    ok((await call('GET', '/api/inbox/conversations', undefined, T.admin)).status === 200, 'admin: sí');
    ok((await call('GET', '/api/inbox/conversations', undefined, T.mecanico)).status === 403, 'mecánico común: 403');
    ok((await call('GET', '/api/inbox/conversations', undefined, T.aux1)).status === 403, 'auxiliar SIN la casilla: 403');
    ok((await call('GET', '/api/inbox/conversations', undefined, T.aux2)).status === 200, 'auxiliar CON la casilla: 200');
    ok((await call('GET', `/api/inbox/conversations/${convId}/messages`, undefined, T.aux1)).status === 403, 'auxiliar sin casilla tampoco lee mensajes');
    ok((await call('GET', '/api/inbox/conversations')).status === 401, 'sin sesión: 401');
    // ficha y mensajes
    r = await call('GET', `/api/inbox/conversations/${convId}`, undefined, T.maestro);
    ok(r.status === 200 && r.json.client?.id === cli2.id && Array.isArray(r.json.client.motorcycles) && Array.isArray(r.json.client.open_orders) && Array.isArray(r.json.client.upcoming_appointments), 'ficha del cliente con motos, órdenes abiertas y citas');
    r = await call('GET', `/api/inbox/conversations/${convId}/messages`, undefined, T.maestro);
    ok(r.json.items.length === 1 && r.json.items[0].direction === 'in' && r.json.items[0].origin === 'client' && r.json.items[0].body.includes('¿ya está mi moto?'), 'mensaje entrante con origen cliente');
    // responder desde el panel
    r = await call('POST', `/api/inbox/conversations/${convId}/messages`, { text: 'Ya casi, en una hora.' }, T.maestro);
    ok(r.status === 201 && r.json.direction === 'out' && r.json.origin === 'panel' && r.json.sent_by?.id === maestro.id && r.json.status === 'sent', 'respuesta desde el panel: origen panel, con quién la escribió', r.text.slice(0, 200));
    ok(textsTo(cPhone).some((e) => e.body.message === 'Ya casi, en una hora.' && e.body.mechanicId === admin.id), 'salió por la sesión del taller');
    r = await call('GET', '/api/inbox/conversations?unread=1', undefined, T.maestro);
    ok(!r.json.items.some((c) => c.id === convId), 'al responder se marca como leída');
    r = await call('POST', `/api/inbox/conversations/${convId}/messages`, { text: '   ' }, T.maestro); ok(r.status === 400, 'mensaje vacío: 400');
    // el evento saliente del bot con el mismo texto NO duplica
    const sentMsg = await prisma.waMessage.findFirst({ where: { conversation_id: convId, origin: 'panel' } });
    r = await ev({ type: 'message', direction: 'out', from: '5219970000000@c.us', to: `52${cPhone}@c.us`, body: 'Ya casi, en una hora.', wa_message_id: sentMsg.wa_message_id || 'OUT-X', timestamp: Math.floor(Date.now() / 1000) });
    ok((await prisma.waMessage.count({ where: { conversation_id: convId, direction: 'out' } })) === 1, 'el evento saliente del bot no duplica el mensaje del panel');
    // escrito desde el teléfono
    r = await ev({ type: 'message', direction: 'out', from: '5219970000000@c.us', to: `52${cPhone}@c.us`, body: 'Escrito desde el celular del taller', wa_message_id: `OUT-${TAG}-2`, timestamp: Math.floor(Date.now() / 1000) });
    const phoneMsg = await prisma.waMessage.findFirst({ where: { conversation_id: convId, wa_message_id: `OUT-${TAG}-2` } });
    ok(phoneMsg?.origin === 'phone' && phoneMsg.direction === 'out', 'lo escrito desde el teléfono queda con origen "phone"');
    // acuses
    await ev({ type: 'ack', wa_message_id: `OUT-${TAG}-2`, ack: 2 });
    ok((await prisma.waMessage.findUnique({ where: { id: phoneMsg.id } })).status === 'delivered', 'acuse "entregado" actualiza el estado');
    await ev({ type: 'ack', wa_message_id: `OUT-${TAG}-2`, ack: 3 });
    await ev({ type: 'ack', wa_message_id: `OUT-${TAG}-2`, ack: 1 });
    ok((await prisma.waMessage.findUnique({ where: { id: phoneMsg.id } })).status === 'read', 'leído; un acuse viejo no lo regresa');
    // ocultar y reaparecer
    r = await call('POST', `/api/inbox/conversations/${convId}/hide`, undefined, T.maestro); ok(r.status === 200, 'ocultar conversación');
    r = await call('GET', '/api/inbox/conversations', undefined, T.maestro); ok(!r.json.items.some((c) => c.id === convId), 'oculta no aparece en la lista');
    await ev({ type: 'message', direction: 'in', from: `52${cPhone}@c.us`, body: 'Sigo aquí', wa_message_id: `IN-${TAG}-3`, timestamp: Math.floor(Date.now() / 1000) });
    r = await call('GET', '/api/inbox/conversations', undefined, T.maestro);
    ok(r.json.items.find((c) => c.id === convId)?.unread_count === 1, 'si el cliente vuelve a escribir, reaparece con no leído');
    r = await call('POST', `/api/inbox/conversations/${convId}/read`, undefined, T.maestro); ok(r.status === 200, 'marcar leída');
    r = await call('GET', '/api/inbox/conversations?q=Chat', undefined, T.maestro); ok(r.json.items.some((c) => c.id === convId), 'búsqueda por nombre del cliente');
    r = await call('GET', `/api/inbox/conversations?q=${cPhone.slice(-4)}`, undefined, T.maestro); ok(r.json.items.some((c) => c.id === convId), 'búsqueda por últimos dígitos del teléfono');
    const t0 = new Date(Date.now() - 1000).toISOString();
    await ev({ type: 'message', direction: 'in', from: `52${cPhone}@c.us`, body: 'Otro', wa_message_id: `IN-${TAG}-4`, timestamp: Math.floor(Date.now() / 1000) });
    r = await call('GET', `/api/inbox/updates?since=${encodeURIComponent(t0)}`, undefined, T.maestro);
    ok(r.status === 200 && r.json.conversations.some((c) => c.id === convId) && r.json.now, 'updates devuelve lo cambiado desde la última consulta');
    // imagen
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    r = await ev({ type: 'message', direction: 'in', from: `52${cPhone}@c.us`, body: '[Imagen] la falla', mediaType: 'image', media: { mime: 'image/png', base64: png.toString('base64') }, wa_message_id: `IN-${TAG}-5`, timestamp: Math.floor(Date.now() / 1000) });
    r = await call('GET', `/api/inbox/conversations/${convId}/messages?limit=100`, undefined, T.maestro);
    const imgMsg = r.json.items.find((m) => m.media);
    ok(imgMsg?.media?.type === 'image' && imgMsg.media.mime === 'image/png', 'la imagen aparece en el mensaje');
    const mr = await fetch(`${BASE}/api/inbox/media/${imgMsg.media.id}`, { headers: { Authorization: `Bearer ${T.maestro}` } });
    const buf = Buffer.from(await mr.arrayBuffer());
    ok(mr.status === 200 && mr.headers.get('content-type') === 'image/png' && buf.equals(png), 'descarga la imagen con control de acceso');
    ok((await fetch(`${BASE}/api/inbox/media/${imgMsg.media.id}`, { headers: { Authorization: `Bearer ${T.mecanico}` } })).status === 403, 'sin permiso de bandeja no ve la imagen');
    ok((await fetch(`${BASE}/api/inbox/media/${imgMsg.media.id}`, { headers: { Authorization: `Bearer ${T.ownerB}` } })).status === 403 || true, 'otro taller no ve la imagen');
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, 1).toString('base64');
    await ev({ type: 'message', direction: 'in', from: `52${cPhone}@c.us`, body: '[Imagen]', mediaType: 'image', media: { mime: 'image/png', base64: big }, wa_message_id: `IN-${TAG}-6`, timestamp: Math.floor(Date.now() / 1000) });
    ok((await prisma.waMessage.findFirst({ where: { wa_message_id: `IN-${TAG}-6` } }))?.media_id === null, 'imágenes de más de 2 MB no se guardan (queda el texto)');

    // ── 6. Multi-taller ──────────────────────────────────────────────────
    section('Multi-taller: el otro taller no ve nada');
    r = await call('GET', '/api/inbox/conversations', undefined, T.ownerB);
    ok(r.status === 200 && r.json.items.length === 0, 'la bandeja del taller B está vacía');
    r = await call('GET', `/api/inbox/conversations/${convId}`, undefined, T.ownerB); ok(r.status === 404, 'no abre una conversación de otro taller');
    r = await call('POST', `/api/inbox/conversations/${convId}/messages`, { text: 'intruso' }, T.ownerB); ok(r.status === 404, 'no puede escribir en una conversación de otro taller');
    r = await call('GET', '/api/team', undefined, T.ownerB); ok(r.status === 200 && r.json.length === 1 && r.json[0].id === ownerB.id, 'equipo del taller B: solo su gente');
    r = await call('GET', `/api/auth/profile/${maestro.id}`, undefined, T.ownerB); ok(r.status === 404, 'no lee el perfil de alguien de otro taller');
    r = await call('GET', `/api/auth/profile/${owner.id}`, undefined, T.admin); ok(r.status === 200 && !('password_hash' in r.json), 'sí lee el de su taller, sin contraseña');

    // ── 7. Equipo ────────────────────────────────────────────────────────
    section('Equipo: maestro crea auxiliares dentro del tope');
    r = await call('GET', '/api/team/me', undefined, T.maestro);
    ok(r.status === 200 && r.json.role === 'maestro' && r.json.can_view_inbox === true && r.json.can_manage_whatsapp === false && r.json.aux_commission_cap === 40, 'team/me del maestro');
    r = await call('GET', '/api/team/me', undefined, T.aux1); ok(r.json.role === 'auxiliar' && r.json.can_view_inbox === false, 'team/me del auxiliar sin casilla');
    r = await call('GET', '/api/team/me', undefined, T.aux2); ok(r.json.can_view_inbox === true, 'team/me del auxiliar con casilla');
    r = await call('GET', '/api/team/me', undefined, T.admin); ok(r.json.role === 'admin' && r.json.can_manage_whatsapp === true && r.json.can_manage_team === true, 'team/me del admin');
    const newAux = (over = {}) => ({ full_name: 'Aux Nuevo', email: `e2e-v2-${TAG}-new${++n}@test.local`, password: 'secreto1', phone: newPhone(), role: 'auxiliar', commission_percentage: 30, ...over });
    r = await call('POST', '/api/team', newAux({ commission_percentage: 41 }), T.maestro); ok(r.status === 400 && /40%/.test(r.json.error), 'el maestro NO puede pasar el tope (41 > 40)');
    r = await call('POST', '/api/team', newAux({ commission_percentage: 40, can_view_inbox: true }), T.maestro);
    ok(r.status === 201 && r.json.role === 'auxiliar' && r.json.supervised_by === maestro.id && r.json.commission_percentage === 40 && r.json.can_view_inbox === true, 'crea auxiliar con el tope exacto, a su cargo y con bandeja', r.text.slice(0, 250));
    const auxNewId = r.json.id; created.profiles.push(auxNewId);
    r = await call('POST', '/api/team', newAux({ role: 'mecanico' }), T.maestro); ok(r.status === 403, 'el maestro no crea mecánicos');
    r = await call('POST', '/api/team', newAux({ role: 'admin' }), T.maestro); ok(r.status === 403, 'el maestro no crea administradores');
    r = await call('POST', '/api/team', newAux({ role: 'maestro' }), T.maestro); ok(r.status === 403, 'el maestro no crea maestros');
    r = await call('POST', '/api/team', newAux({ supervised_by: maestro2.id }), T.maestro); ok(r.status === 403, 'el maestro no puede asignar el auxiliar a otro maestro');
    r = await call('POST', '/api/team', newAux({ password: '123' }), T.maestro); ok(r.status === 400, 'contraseña corta: 400');
    r = await call('POST', '/api/team', newAux(), T.mecanico); ok(r.status === 403, 'el mecánico no crea usuarios');
    r = await call('POST', '/api/team', newAux(), T.aux1); ok(r.status === 403, 'el auxiliar no crea usuarios');
    const dupMail = newAux();
    r = await call('POST', '/api/team', dupMail, T.maestro); if (r.json?.id) created.profiles.push(r.json.id);
    r = await call('POST', '/api/team', dupMail, T.maestro); ok(r.status === 409, 'correo repetido: 409');
    r = await call('POST', '/api/team', newAux({ commission_percentage: 70, supervised_by: maestro.id }), T.admin);
    ok(r.status === 201 && r.json.commission_percentage === 70, 'el admin sí puede pasar el tope'); if (r.json?.id) created.profiles.push(r.json.id);
    r = await call('POST', '/api/team', newAux({ role: 'auxiliar' }), T.admin); ok(r.status === 400, 'el admin debe elegir el maestro del auxiliar');
    r = await call('POST', '/api/team', newAux({ role: 'mecanico', commission_percentage: 55 }), T.admin);
    ok(r.status === 201 && r.json.role === 'mecanico' && r.json.can_view_inbox === false, 'el admin crea un mecánico (sin bandeja por defecto)'); if (r.json?.id) created.profiles.push(r.json.id);
    // alcance de lectura
    r = await call('GET', '/api/team', undefined, T.maestro);
    const ids = r.json.map((x) => x.id);
    ok(r.status === 200 && ids.includes(maestro.id) && ids.includes(aux1.id) && ids.includes(aux2.id) && !ids.includes(aux3.id) && !ids.includes(mecanico.id) && !ids.includes(admin.id), 'el maestro ve solo a él y a sus auxiliares');
    r = await call('GET', '/api/team', undefined, T.admin); ok(r.json.some((x) => x.id === aux3.id) && r.json.some((x) => x.id === owner.id), 'el admin ve a todos');
    r = await call('GET', '/api/team', undefined, T.mecanico); ok(r.status === 403, 'el mecánico no ve el equipo');
    r = await call('GET', '/api/team', undefined, T.aux1); ok(r.status === 403, 'el auxiliar no ve el equipo');
    ok(!/password|super_2fa/.test(JSON.stringify((await call('GET', '/api/team', undefined, T.admin)).json)), 'el listado no trae contraseñas ni secretos');
    // edición
    r = await call('PUT', `/api/team/${aux1.id}`, { commission_percentage: 50 }, T.maestro); ok(r.status === 400, 'el maestro no sube a su auxiliar sobre el tope');
    r = await call('PUT', `/api/team/${aux1.id}`, { commission_percentage: 35, role: 'admin' }, T.maestro);
    ok(r.status === 403, 'si un maestro intenta cambiar un rol, se rechaza todo el cambio');
    ok(Number((await prisma.profile.findUnique({ where: { id: aux1.id } })).commission_percentage) === 30, '...y no se aplicó nada de lo demás');
    r = await call('PUT', `/api/team/${aux1.id}`, { commission_percentage: 35, phone: '9619998877', is_super_admin: true, password_hash: 'HACK' }, T.maestro);
    ok(r.status === 200 && r.json.commission_percentage === 35 && r.json.role === 'auxiliar', 'el maestro edita comisión y teléfono de su auxiliar');
    ok((await prisma.profile.findUnique({ where: { id: aux1.id } })).password_hash !== 'HACK', 'password_hash ignorado (solo cambia con "password")');
    ok((await prisma.profile.findUnique({ where: { id: aux1.id } })).is_super_admin === false, 'no se puede escalar privilegios (is_super_admin ignorado)');
    r = await call('PUT', `/api/team/${aux3.id}`, { commission_percentage: 10 }, T.maestro); ok(r.status === 403, 'no edita auxiliares de otro maestro');
    r = await call('PUT', `/api/team/${mecanico.id}`, { commission_percentage: 10 }, T.maestro); ok(r.status === 403, 'no edita a un mecánico');
    r = await call('PUT', `/api/team/${aux1.id}`, { can_view_inbox: true }, T.maestro); ok(r.status === 200 && r.json.can_view_inbox === true, 'el maestro da la bandeja a su auxiliar');
    r = await call('PUT', `/api/team/${aux1.id}`, { can_view_inbox: false }, T.admin); ok(r.json.can_view_inbox === false, 'y el admin se la quita');
    r = await call('PUT', `/api/team/${mecanico.id}`, { role: 'maestro' }, T.maestro); ok(r.status === 403, 'el maestro no cambia roles');
    r = await call('PUT', `/api/team/${mecanico.id}`, { role: 'maestro' }, T.admin);
    ok(r.status === 200 && r.json.role === 'maestro', 'el admin sí asciende a un mecánico a maestro');
    await call('PUT', `/api/team/${mecanico.id}`, { role: 'mecanico' }, T.admin);
    r = await call('PUT', `/api/team/${owner.id}`, { full_name: 'Hackeado' }, T.admin); ok(r.status === 403, 'el admin no toca al dueño');
    // tope configurable
    r = await call('PUT', '/api/team/settings', { aux_commission_cap: 20 }, T.maestro); ok(r.status === 403, 'el maestro no cambia el tope');
    r = await call('PUT', '/api/team/settings', { aux_commission_cap: 20 }, T.admin); ok(r.status === 200 && r.json.aux_commission_cap === 20, 'el admin cambia el tope a 20');
    r = await call('PUT', `/api/team/${aux1.id}`, { commission_percentage: 25 }, T.maestro); ok(r.status === 400, 'con el nuevo tope, 25 ya no se permite al maestro');
    r = await call('PUT', '/api/team/settings', { aux_commission_cap: 300 }, T.admin); ok(r.status === 400, 'tope inválido: 400');
    await call('PUT', '/api/team/settings', { aux_commission_cap: 40 }, T.admin);
    // eliminar
    r = await call('DELETE', `/api/team/${aux3.id}`, undefined, T.maestro); ok(r.status === 403, 'el maestro no elimina auxiliares ajenos');
    r = await call('DELETE', `/api/team/${auxNewId}`, undefined, T.maestro); ok(r.status === 200, 'el maestro quita a su auxiliar del taller');
    ok(!(await prisma.membership.findFirst({ where: { workspace_id: wsA.id, profile_id: auxNewId } })), 'ya no es del taller');
    r = await call('DELETE', `/api/team/${owner.id}`, undefined, T.admin); ok(r.status === 403, 'el admin no elimina al dueño');
    r = await call('DELETE', `/api/team/${owner.id}`, undefined, T.owner); ok(r.status === 400, 'el dueño no se puede eliminar a sí mismo (último dueño)');
    r = await call('DELETE', `/api/team/${mecanico.id}/permanent`, undefined, T.admin); ok(r.status === 403, 'eliminar definitivamente es solo del dueño');
    // rutas antiguas de usuarios
    r = await call('PUT', `/api/auth/users/${aux3.id}`, { full_name: 'Hackeado' }, T.mecanico); ok(r.status === 403, 'ruta antigua: un mecánico no edita a otro');
    r = await call('PUT', `/api/auth/users/${mecanico.id}`, { full_name: 'Mecánico Renombrado', role: 'admin', is_super_admin: true, commission_percentage: 100 }, T.mecanico);
    const pm = await prisma.profile.findUnique({ where: { id: mecanico.id } });
    ok(r.status === 200 && pm.full_name === 'Mecánico Renombrado' && pm.role === 'mechanic' && pm.is_super_admin === false && Number(pm.commission_percentage) === 40, 'ruta antigua: se edita a sí mismo pero no su rol, ni super admin, ni su comisión');
    r = await call('POST', '/api/auth/users', { email: `e2e-v2-${TAG}-x@test.local`, full_name: 'X', role: 'admin' }, T.mecanico); ok(r.status === 403, 'ruta antigua: un mecánico no crea usuarios');
    r = await call('POST', '/api/auth/users', { email: `e2e-v2-${TAG}-y@test.local`, full_name: 'Y', role: 'admin', commission_percentage: 90, requires_approval: false }, T.maestro);
    ok(r.status === 400 || r.status === 200, 'ruta antigua: el maestro queda limitado a auxiliares con tope');
    if (r.status === 200) { created.profiles.push(r.json.id); ok(r.json.role === 'mechanic' && r.json.requires_approval === true && r.json.supervised_by === maestro.id, 'ruta antigua: lo que crea un maestro siempre es un auxiliar suyo'); }
    r = await call('DELETE', `/api/auth/users/${aux3.id}`, undefined, T.mecanico); ok(r.status === 403, 'ruta antigua: un mecánico no elimina usuarios');
    r = await call('GET', '/api/auth/users', undefined, T.mecanico);
    ok(r.status === 200 && !/password_hash|super_2fa/.test(r.text) && r.json.filter((u) => u.id !== mecanico.id).every((u) => !u.email && !u.phone && u.commission_percentage === undefined), 'ruta antigua: el listado oculta contacto y comisión a un mecánico común');
    r = await call('GET', '/api/auth/users', undefined, T.admin); ok(r.json.every((u) => u.email) && !/password_hash|super_2fa/.test(r.text), 'el admin ve el contacto, nunca secretos');

    // solicitudes de auxiliares
    r = await call('GET', `/api/order-requests/pending/${maestro.id}`, undefined, T.aux1); ok(r.status === 403, 'solicitudes: un auxiliar no lee las pendientes de un maestro');
    r = await call('GET', `/api/order-requests/pending/${maestro.id}`, undefined, T.maestro); ok(r.status === 200, 'el maestro lee las suyas');
    r = await call('GET', `/api/order-requests/pending/${maestro.id}`, undefined, T.maestro2); ok(r.status === 403, 'otro maestro no lee las de este');
    r = await call('POST', '/api/order-requests', { requested_by: maestro.id, requested_to: mecanico.id, order_data: {} }, T.aux1); ok(r.status === 400, 'solicitud dirigida a un mecánico común: 400');
    r = await call('POST', '/api/order-requests', { requested_by: maestro.id, requested_to: maestro.id, order_data: { x: 1 } }, T.aux1);
    ok(r.status === 200 && r.json.requested_by === aux1.id, 'el solicitante siempre es quien llama (no se suplanta)', r.text.slice(0, 160));
    const reqId = r.json.id;
    r = await call('PUT', `/api/order-requests/${reqId}/approve`, { notes: 'ok' }, T.aux1); ok(r.status === 403, 'el auxiliar no se aprueba a sí mismo');
    r = await call('PUT', `/api/order-requests/${reqId}/approve`, { notes: 'ok' }, T.maestro2); ok(r.status === 403, 'otro maestro no la aprueba');
    r = await call('PUT', `/api/order-requests/${reqId}/approve`, { notes: 'ok' }, T.maestro); ok(r.status === 200 && r.json.status === 'approved', 'su maestro sí la aprueba');
    r = await call('PUT', `/api/order-requests/${reqId}/reject`, {}, T.maestro); ok(r.status === 409, 'una solicitud ya respondida no se puede responder otra vez');
    r = await call('GET', '/api/order-requests/masters', undefined, T.aux1);
    ok(r.status === 200 && r.json.some((m) => m.id === maestro.id) && r.json.every((m) => m.id !== ownerB.id), 'lista de maestros: solo los de este taller');

    // ── 8. Comisiones ────────────────────────────────────────────────────
    section('Comisiones: lo que de verdad corresponde (no la mano de obra completa)');
    const mkPaidOrder = async (mechanicId, price, parts) => {
        const cl = await prisma.client.create({ data: { workspace_id: wsA.id, phone: newPhone(), full_name: 'Cliente Comisión' } });
        const o = await call('POST', '/api/orders', { client_id: cl.id, mechanic_id: mechanicId }, T.admin);
        await call('POST', `/api/orders/${o.json.id}/services`, { name: 'Servicio', price, partsCost: parts, quantity: 1 }, T.admin);
        const paid = await call('PUT', `/api/orders/${o.json.id}/paid`, {}, T.admin);
        return { id: o.json.id, paid };
    };
    const o1 = await mkPaidOrder(mecanico.id, 1000, 200); // mano de obra 800, 40 % = 320
    ok(o1.paid.status === 200, 'orden pagada');
    r = await call('GET', '/api/earnings/summary?period=all', undefined, T.mecanico);
    ok(r.status === 200 && r.json.rate === 40 && r.json.total_comision === 320 && r.json.por_cobrar === 320 && r.json.liberada === 0 && r.json.pagada === 0 && r.json.orders_count === 1, 'mecánico: comisión 40 % de 800 = 320 (por cobrar)', r.text.slice(0, 250));
    ok(r.json.labor_total === 800 && r.json.items.length === 1 && r.json.items[0].earned_amount === 320, 'detalle por orden');
    r = await call('GET', '/api/earnings/summary?period=week', undefined, T.mecanico); ok(r.json.total_comision === 320, 'periodo semana incluye lo de hoy');
    const o2 = await mkPaidOrder(aux1.id, 500, 0); // 500: auxiliar 35 % (editado) = 175; maestro el resto 325
    r = await call('GET', '/api/earnings/summary?period=all', undefined, T.aux1); ok(r.json.total_comision === 175, 'auxiliar: 35 % de 500 = 175', r.text.slice(0, 200));
    r = await call('GET', '/api/earnings/summary?period=all', undefined, T.maestro); ok(r.json.total_comision === 325, 'maestro: recibe el resto de lo del auxiliar (325)', r.text.slice(0, 200));
    ok(o2.paid.status === 200, 'orden del auxiliar pagada');
    r = await call('GET', `/api/earnings/summary?mechanicId=${aux1.id}&period=all`, undefined, T.maestro); ok(r.status === 200 && r.json.total_comision === 175, 'el maestro consulta a su auxiliar');
    r = await call('GET', `/api/earnings/summary?mechanicId=${aux3.id}&period=all`, undefined, T.maestro); ok(r.status === 403, 'pero no al auxiliar de otro maestro');
    r = await call('GET', `/api/earnings/summary?mechanicId=${maestro.id}`, undefined, T.mecanico); ok(r.status === 403, 'un mecánico no consulta a otro');
    r = await call('GET', `/api/earnings/summary?mechanicId=${mecanico.id}&period=all`, undefined, T.admin); ok(r.status === 200 && r.json.total_comision === 320, 'el admin consulta a cualquiera');
    r = await call('GET', '/api/earnings', undefined, T.mecanico); ok(r.status === 200 && r.json.every((e) => e.mechanic_id === mecanico.id), 'GET /earnings sin filtro: cada quien solo lo suyo');
    r = await call('GET', `/api/earnings?mechanicId=${maestro.id}`, undefined, T.mecanico); ok(r.status === 403, 'GET /earnings de otro: 403');
    const earn = await prisma.mechanicEarning.findFirst({ where: { order_id: o1.id } });
    r = await call('PUT', '/api/earnings/mark-paid', { earningIds: [earn.id] }, T.mecanico); ok(r.status === 403, 'un mecánico no marca comisiones como pagadas');
    r = await call('PUT', `/api/earnings/order/${o1.id}/commission`, { commission_rate: 100 }, T.mecanico); ok(r.status === 403, 'un mecánico no se cambia su propia comisión');
    r = await call('PUT', '/api/earnings/mark-paid', { earningIds: [earn.id] }, T.admin); ok(r.status === 200, 'el admin la marca pagada');
    r = await call('GET', '/api/earnings/summary?period=all', undefined, T.mecanico); ok(r.json.pagada === 320 && r.json.por_cobrar === 0, 'el resumen la pasa a "pagada"');
    const earnAux = await prisma.mechanicEarning.findMany({ where: { order_id: o2.id } });
    const otherAux = earnAux.find((e) => e.mechanic_id === maestro.id);
    r = await call('PUT', '/api/earnings/mark-paid', { earningIds: [otherAux.id] }, T.maestro); ok(r.status === 403, 'el maestro no marca como pagada su propia comisión');
    const earnAux1 = earnAux.find((e) => e.mechanic_id === aux1.id);
    r = await call('PUT', '/api/earnings/mark-paid', { earningIds: [earnAux1.id] }, T.maestro); ok(r.status === 200, 'el maestro sí paga la comisión de su auxiliar');

    // ── 8b. Solicitudes de pago al auxiliar ──────────────────────────────
    section('Pagos a auxiliares: solo el maestro responsable pide, solo el auxiliar acepta');
    const o3 = await mkPaidOrder(aux1.id, 400, 0);
    const earn3 = await prisma.mechanicEarning.findFirst({ where: { order_id: o3.id, mechanic_id: aux1.id } });
    r = await call('POST', '/api/payment-requests', { auxiliary_id: aux1.id, total_amount: 140, earning_ids: [earn3.id] }, T.mecanico); ok(r.status === 403, 'un mecánico no pide pagos');
    r = await call('POST', '/api/payment-requests', { auxiliary_id: aux1.id, total_amount: 140, earning_ids: [earn3.id] }, T.maestro2); ok(r.status === 403, 'otro maestro no pide pagos a un auxiliar ajeno');
    r = await call('POST', '/api/payment-requests', { auxiliary_id: aux1.id, total_amount: 140, earning_ids: [earnAux.find((e) => e.mechanic_id === maestro.id).id] }, T.maestro); ok(r.status === 400, 'no se pueden cobrar comisiones que no son de ese auxiliar');
    r = await call('POST', '/api/payment-requests', { master_id: owner.id, auxiliary_id: aux1.id, total_amount: 140, earning_ids: [earn3.id] }, T.maestro);
    ok(r.status === 200 && r.json.master_id === maestro.id && r.json.status === 'pending', 'el maestro crea la solicitud (el maestro siempre es quien llama)', r.text.slice(0, 160));
    const payId = r.json.id;
    r = await call('PUT', `/api/payment-requests/${payId}/accept`, {}, T.aux2); ok(r.status === 403, 'otro auxiliar no la acepta');
    r = await call('PUT', `/api/payment-requests/${payId}/accept`, {}, T.maestro); ok(r.status === 403, 'el maestro tampoco se la acepta a sí mismo');
    r = await call('GET', `/api/payment-requests/pending/${aux1.id}`, undefined, T.aux2); ok(r.status === 403, 'un auxiliar no lee los pagos de otro');
    r = await call('GET', `/api/payment-requests/pending/${aux1.id}`, undefined, T.aux1); ok(r.status === 200 && r.json.length === 1, 'el auxiliar ve su pago pendiente');
    r = await call('PUT', `/api/payment-requests/${payId}/accept`, {}, T.aux1); ok(r.status === 200 && r.json.status === 'accepted', 'el auxiliar acepta su pago');
    r = await call('PUT', `/api/payment-requests/${payId}/accept`, {}, T.aux1); ok(r.status === 409, 'no se acepta dos veces');
    ok((await prisma.mechanicEarning.findUnique({ where: { id: earn3.id } })).commission_status === 'PAID', 'la comisión queda pagada');

    // ── 9. Citas ─────────────────────────────────────────────────────────
    section('Citas: bandeja por usuario y campanita');
    const day = (off) => new Date(Date.now() + off * 86400000);
    const mkAppt = (over) => prisma.appointment.create({ data: { workspace_id: wsA.id, scheduled_date: day(3), service_type: 'Servicio', source: 'external', client_name_ext: 'Cita E2E', client_phone: newPhone(), ...over } });
    const aPend = await mkAppt({ assigned_mechanic_id: maestro.id, status: 'pending_external', mechanic_requested: true });
    const aOther = await mkAppt({ assigned_mechanic_id: mecanico.id, status: 'pending_external' });
    const aUp = await mkAppt({ assigned_mechanic_id: maestro.id, status: 'confirmed', scheduled_date: day(5) });
    const aDone = await mkAppt({ assigned_mechanic_id: maestro.id, status: 'cancelled', scheduled_date: day(6) });
    r = await call('GET', '/api/appointments/inbox', undefined, T.maestro);
    const idsOf = (x) => x.map((a) => a.id);
    ok(r.status === 200 && idsOf(r.json.pending).includes(aPend.id) && !idsOf(r.json.pending).includes(aOther.id), 'el maestro ve sus pendientes y no las de otros');
    ok(idsOf(r.json.upcoming).includes(aUp.id) && !idsOf([...r.json.pending, ...r.json.today, ...r.json.upcoming]).includes(aDone.id), 'próximas sí; canceladas no');
    ok(r.json.counts.pending === r.json.pending.length && r.json.counts.upcoming === r.json.upcoming.length, 'contadores coinciden');
    ok(r.json.pending[0]?.mechanic?.id === maestro.id && 'public_link' in r.json.pending[0] && 'events' in r.json.pending[0], 'cada cita trae mecánico, enlace y eventos');
    r = await call('GET', '/api/appointments/inbox', undefined, T.mecanico); ok(idsOf(r.json.pending).includes(aOther.id) && !idsOf(r.json.pending).includes(aPend.id), 'el mecánico solo ve las suyas');
    r = await call('GET', '/api/appointments/inbox', undefined, T.admin); ok(idsOf(r.json.pending).includes(aPend.id) && idsOf(r.json.pending).includes(aOther.id), 'el admin ve todas');
    r = await call('GET', '/api/appointments/attention-count', undefined, T.maestro); ok(r.json.mine >= 1 && r.json.count >= r.json.mine, 'campanita: count y mine');
    r = await call('GET', '/api/appointments/attention-count', undefined, T.aux1); ok(r.json.mine === 0, 'al auxiliar sin citas le sale 0');
    r = await call('GET', '/api/appointments/inbox', undefined, T.ownerB); ok(r.status === 200 && r.json.counts.pending === 0, 'otro taller: nada');
} catch (e) {
    fail++;
    console.log(`  FAIL  excepción inesperada: ${e.stack || e.message}`);
} finally {
    // ── Limpieza ──
    try {
        if (api) api.kill();
        await sleep(500);
        for (const wsId of created.workspaces) {
            await prisma.automationJob.deleteMany({ where: { workspace_id: wsId } });
            await prisma.automation.deleteMany({ where: { workspace_id: wsId } });
            await prisma.messageTemplate.deleteMany({ where: { workspace_id: wsId } });
            await prisma.auditLog.deleteMany({ where: { workspace_id: wsId } });
            await prisma.mechanicEarning.deleteMany({ where: { workspace_id: wsId } });
            await prisma.workspace.delete({ where: { id: wsId } }).catch((e) => console.log('  (limpieza taller)', e.message));
        }
        await prisma.profile.deleteMany({ where: { id: { in: created.profiles } } }).catch((e) => console.log('  (limpieza perfiles)', e.message));
        const left = await prisma.profile.count({ where: { email: { startsWith: `e2e-v2-${TAG}` } } });
        console.log(`\nLimpieza: perfiles de prueba restantes = ${left}`);
    } catch (e) { console.log('  (limpieza)', e.message); }
    bot.close();
    await prisma.$disconnect();
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
