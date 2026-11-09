// E2E de la cita en linea (API publica + panel) contra la BD local de desarrollo.
//   cd apps/api && DATABASE_URL=postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes node test/_public_booking_e2e.mjs
// Arranca su propia API (puerto 3101, y otra en 3111 con limites bajos) y un "bot de WhatsApp" falso (3199),
// crea sus propios datos de prueba (telefonos 999…, correos e2e-…@test.local) y los borra al terminar.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';

const WS = process.env.LANDING_VC_WORKSPACE_ID || '7b795e9a-c398-49f1-9ca0-aee971805172';
const SECRET = 'local-dev-only-change-me';
const PORT = 3101, PORT_LIM = 3111, BOT_PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const TAG = Math.random().toString(36).slice(2, 8);
const rnd7 = () => String(Math.floor(Math.random() * 1e7)).padStart(7, '0');
const myPhones = new Set();
const newPhone = () => { const p = `999${rnd7()}`; myPhones.add(p); return p; };

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};
const section = (t) => console.log(`\n== ${t}`);

// ── Bot de WhatsApp falso ────────────────────────────────────────────────
const sent = [];
const bot = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        try { sent.push(JSON.parse(body)); } catch { /* ignorar */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success":true}');
    });
});
await new Promise((r) => bot.listen(BOT_PORT, r));

// ── Servidores de API ────────────────────────────────────────────────────
function startApi(port, extraEnv = {}) {
    const child = spawn(process.execPath, ['src/index.js'], {
        env: {
            ...process.env, PORT: String(port), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'local-dev-bot-key',
            LANDING_VC_WORKSPACE_ID: WS, WHATSAPP_BOT_INTERNAL_URL: `http://localhost:${BOT_PORT}`,
            PANEL_URL: 'https://panel.test', LOG_LEVEL: 'silent',
            APPT_PHONE_DAILY_LIMIT: '100', LOOKUP_IP_PER_MIN: '200', LOOKUP_PHONE_PER_DAY: '200',
            ...extraEnv,
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
const call = async (base, method, path, body, token) => {
    const res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* no json */ }
    return { status: res.status, json, text };
};
const api = (m, p, b, t) => call(BASE, m, p, b, t);
const tokenFor = (p, role) => jwt.sign({ id: p.id, email: p.email, role, workspace_id: WS }, SECRET, { expiresIn: '1h' });

// ── Fechas ───────────────────────────────────────────────────────────────
const MX = 6 * 3600 * 1000;
const dayStr = (offset) => new Date(Date.now() + offset * 86400000 - MX).toISOString().slice(0, 10);
const isSun = (f) => new Date(`${f}T12:00:00-06:00`).getUTCDay() === 0;
const usedDays = new Set();
function pickDay() {
    for (let i = 0; i < 200; i++) {
        const f = dayStr(30 + Math.floor(Math.random() * 85));
        if (!isSun(f) && !usedDays.has(f)) { usedDays.add(f); return f; }
    }
    throw new Error('sin día libre');
}

// ── Datos de prueba ──────────────────────────────────────────────────────
const created = { profiles: [], phones: [] };
const mkProfile = async (name, { phone = newPhone(), visible = true, active = true, role = 'mechanic' } = {}) => {
    const p = await prisma.profile.create({ data: { email: `e2e-${TAG}-${created.profiles.length}@test.local`, full_name: name, phone, role: 'mechanic', is_active: active } });
    await prisma.membership.create({ data: { workspace_id: WS, profile_id: p.id, role, online_booking_visible: visible } });
    created.profiles.push(p.id);
    return p;
};

const servers = [];
let exitCode = 0;
try {
    const mA = await mkProfile(`Zeta Maciel ${TAG}`, { role: 'mechanic' });
    const mB = await mkProfile(`Alfa Eligio ${TAG}`, { role: 'auxiliary' });
    const mHidden = await mkProfile(`Oculto Nadie ${TAG}`, { visible: false });
    const mInactive = await mkProfile(`Inactivo Nadie ${TAG}`, { active: false });
    const mNoPhone = await mkProfile(`Sintel Lopez ${TAG}`, { phone: null });
    // Sesion de WhatsApp "conectada" para que el envio llegue al bot falso.
    const sess = await prisma.whatsappSession.create({ data: { workspace_id: WS, mechanic_id: mA.id, is_connected: true, phone_number: '999FAKE' } });

    const main = startApi(PORT); servers.push(main);
    await waitUp(PORT);

    // ── 1. Lista de quien atiende ────────────────────────────────────────
    section('GET /mechanics');
    let r = await api('GET', '/api/public/mechanics');
    ok(r.status === 200 && Array.isArray(r.json), 'responde 200 con un arreglo');
    const names = r.json.map((m) => m.nombre);
    ok(r.json.some((m) => m.id === mA.id) && r.json.some((m) => m.id === mB.id), 'incluye mecánico y auxiliar activos y visibles');
    ok(!r.json.some((m) => m.id === mHidden.id), 'no incluye al que se ocultó de las citas en línea');
    ok(!r.json.some((m) => m.id === mInactive.id), 'no incluye al usuario inactivo');
    ok(r.json.every((m) => Object.keys(m).sort().join() === 'id,nombre'), 'solo expone id y nombre');
    ok(!/auxiliar|auxiliary|mechanic|owner|admin|@|phone|telefono/i.test(JSON.stringify(r.json.filter((m) => [mA.id, mB.id].includes(m.id)))), 'sin rol, correo ni teléfono');
    ok(names.indexOf(mB.full_name) < names.indexOf(mA.full_name), 'ordenados por nombre');

    // ── 2. Lookup ────────────────────────────────────────────────────────
    section('POST /lookup');
    const phoneNew = newPhone();
    created.phones.push(phoneNew);
    r = await api('POST', '/api/public/lookup', { telefono: phoneNew });
    ok(r.status === 200 && r.json.found === false && Object.keys(r.json).length === 1, 'teléfono desconocido -> {found:false}');
    r = await api('POST', '/api/public/lookup', { telefono: '123' });
    ok(r.status === 400, 'teléfono inválido -> 400');
    r = await api('GET', `/api/public/lookup?telefono=${phoneNew}`);
    ok(r.status === 404, 'GET /lookup no existe (solo POST)');

    // ── 3. Cliente nuevo ─────────────────────────────────────────────────
    section('Cliente nuevo agenda con mecánico A');
    const d1 = pickDay();
    sent.length = 0;
    r = await api('POST', '/api/public/appointments', {
        nombre: 'Juan Pérez López', telefono: phoneNew, mecanico_id: mA.id, tipo_servicio: 'Afinación general',
        fecha: d1, hora: '10:00', notas: 'Hace ruido', moto_marca: 'Honda', moto_modelo: 'CB190R', moto_anio: '2021',
    });
    ok(r.status === 201 && r.json.success && r.json.link && r.json.id, 'responde 201 con enlace', JSON.stringify(r.json));
    const appt1 = await prisma.appointment.findUnique({ where: { id: r.json.id } });
    const cli = await prisma.client.findFirst({ where: { workspace_id: WS, phone: phoneNew } });
    ok(!!cli && cli.full_name === 'Juan Pérez López' && cli.origin === 'cita_web' && cli.web_unconfirmed === true, 'se creó el cliente (cita_web, por confirmar)');
    ok(cli?.phone === phoneNew && /^\d{10}$/.test(cli.phone), 'teléfono guardado en 10 dígitos');
    ok(cli?.preferred_mechanic_id === mA.id, 'mecánico preferido = el elegido');
    const motos1 = await prisma.motorcycle.findMany({ where: { client_id: cli.id } });
    ok(motos1.length === 1 && motos1[0].brand === 'Honda' && motos1[0].model === 'CB190R' && motos1[0].year === 2021, 'se creó la moto con marca, modelo y año');
    ok(appt1.client_id === cli.id && appt1.motorcycle_id === motos1[0].id && appt1.assigned_mechanic_id === mA.id && appt1.mechanic_requested === true, 'la cita queda ligada a cliente, moto y mecánico');
    ok(appt1.status === 'pending_external' && appt1.moto_label === 'Honda CB190R 2021' && appt1.client_phone === phoneNew && appt1.client_name_ext === 'Juan Pérez López', 'conserva moto_label, client_phone y client_name_ext');
    for (let i = 0; i < 30 && sent.length < 2; i++) await sleep(100);
    const toCustomer = sent.find((m) => String(m.phone).endsWith(phoneNew));
    const toMech = sent.find((m) => String(m.phone).endsWith(mA.phone));
    ok(!!toCustomer && /Te atiende: Zeta Maciel/.test(toCustomer.message), 'el cliente recibe su aviso y ve quién lo atiende');
    ok(!!toMech, 'el mecánico elegido recibe aviso por WhatsApp');
    ok(toMech && toMech.message.includes(`https://panel.test/mechanic/appointments?cita=${appt1.id}`), 'el aviso lleva el enlace a su cita en el panel');
    ok(toMech && /Juan Pérez López/.test(toMech.message) && /Honda CB190R 2021/.test(toMech.message) && /Afinación general/.test(toMech.message), 'el aviso lleva cliente, moto y servicio');
    ok(toMech && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(toMech.message), 'el aviso al mecánico no trae emojis');
    const ev = await prisma.appointmentEvent.findMany({ where: { appointment_id: appt1.id } });
    ok(ev.some((e) => e.type === 'requested') && ev.some((e) => e.type === 'mechanic_notified'), 'quedan eventos requested y mechanic_notified');

    // ── 4. Lookup de un cliente que ya existe ────────────────────────────
    section('Lookup reconoce al cliente sin filtrar datos');
    await prisma.motorcycle.update({ where: { id: motos1[0].id }, data: { plates: 'PLACA-SECRETA', vin: 'VIN-SECRETO-123' } });
    r = await api('POST', '/api/public/lookup', { telefono: `+52 ${phoneNew}` });
    ok(r.status === 200 && r.json.found === true && r.json.nombre === 'Juan Pérez López', 'devuelve el nombre completo (acepta +52)');
    ok(r.json.motos.length === 1 && Object.keys(r.json.motos[0]).sort().join() === 'anio,id,marca,modelo' && r.json.motos[0].marca === 'Honda', 'motos: solo id, marca, modelo y año');
    ok(Object.keys(r.json).sort().join() === 'found,motos,nombre', 'respuesta sin campos extra');
    ok(!/PLACA|VIN-|plates|vin|phone|telefono|\b99\d{8}\b/i.test(r.text), 'no filtra placas, serie ni teléfono', r.text);

    // ── 5. Cliente existente + su moto (moto_id) ─────────────────────────
    section('Cliente existente elige su moto');
    const d2 = pickDay();
    r = await api('POST', '/api/public/appointments', {
        nombre: 'Otro Nombre Distinto', telefono: phoneNew, mecanico_id: mB.id, tipo_servicio: 'Frenos y suspensión',
        fecha: d2, hora: '11:00', moto_id: motos1[0].id,
    });
    ok(r.status === 201, 'moto_id propia -> 201', JSON.stringify(r.json));
    ok((await prisma.motorcycle.count({ where: { client_id: cli.id } })) === 1, 'no duplica la moto');
    ok((await prisma.client.count({ where: { workspace_id: WS, phone: phoneNew } })) === 1, 'no duplica al cliente');
    const cli2 = await prisma.client.findUnique({ where: { id: cli.id } });
    ok(cli2.full_name === 'Juan Pérez López', 'no cambia el nombre del cliente que ya existía');
    ok(cli2.preferred_mechanic_id === mA.id, 'no pisa su mecánico preferido');

    // ── 6. Misma moto escrita distinto ───────────────────────────────────
    section('Misma moto escrita distinto no se duplica');
    const d3 = pickDay();
    r = await api('POST', '/api/public/appointments', {
        telefono: phoneNew, mecanico_id: mA.id, tipo_servicio: 'Diagnóstico general', fecha: d3, hora: '09:00',
        moto_marca: 'honda', moto_modelo: 'cb 190 r', moto_anio: '2021',
    });
    ok(r.status === 201, 'cliente existente sin nombre -> 201', JSON.stringify(r.json));
    ok((await prisma.motorcycle.count({ where: { client_id: cli.id } })) === 1, 'reutiliza la moto existente');

    // ── 7. Moto nueva ────────────────────────────────────────────────────
    section('Cliente existente agrega una moto nueva');
    const d4 = pickDay();
    r = await api('POST', '/api/public/appointments', {
        telefono: phoneNew, mecanico_id: mA.id, tipo_servicio: 'Sistema eléctrico', fecha: d4, hora: '12:00',
        moto_marca: 'Yamaha', moto_modelo: 'FZ25', moto_anio: '2023',
    });
    ok(r.status === 201, 'moto nueva -> 201');
    const motos2 = await prisma.motorcycle.findMany({ where: { client_id: cli.id }, orderBy: { created_at: 'asc' } });
    ok(motos2.length === 2 && motos2[1].brand === 'Yamaha', 'se guardó la moto nueva en su ficha');
    r = await api('POST', '/api/public/lookup', { telefono: phoneNew });
    ok(r.json.motos.length === 2, 'lookup ya muestra las dos motos');

    // ── 8. Validaciones ──────────────────────────────────────────────────
    section('Validaciones');
    const base = { nombre: 'Prueba', telefono: newPhone(), tipo_servicio: 'Afinación general', fecha: pickDay(), hora: '13:00', moto_marca: 'Honda', moto_modelo: 'Wave' };
    r = await api('POST', '/api/public/appointments', { ...base });
    ok(r.status === 400 && r.json.error === 'Elige quién te atiende.', 'sin mecanico_id -> 400 "Elige quién te atiende."', JSON.stringify(r.json));
    r = await api('POST', '/api/public/appointments', { ...base, mecanico_id: 'cualquiera' });
    ok(r.status === 400, 'mecanico_id "cualquiera" -> 400');
    r = await api('POST', '/api/public/appointments', { ...base, mecanico_id: mHidden.id });
    ok(r.status === 400, 'mecánico oculto -> 400');
    r = await api('POST', '/api/public/appointments', { ...base, mecanico_id: mInactive.id });
    ok(r.status === 400, 'mecánico inactivo -> 400');
    r = await api('POST', '/api/public/appointments', { ...base, mecanico_id: '00000000-0000-4000-8000-000000000000' });
    ok(r.status === 400, 'mecánico inexistente -> 400');
    r = await api('POST', '/api/public/appointments', { ...base, mecanico_id: mA.id, nombre: '' });
    ok(r.status === 400 && /nombre/i.test(r.json.error), 'cliente nuevo sin nombre -> 400');
    r = await api('POST', '/api/public/appointments', { ...base, mecanico_id: mA.id, moto_marca: '', moto_modelo: '' });
    ok(r.status === 400, 'cliente nuevo sin moto -> 400');
    r = await api('POST', '/api/public/appointments', { ...base, mecanico_id: mA.id, moto_id: motos1[0].id });
    ok(r.status === 400, 'cliente nuevo con moto_id ajena -> 400');
    ok((await prisma.client.count({ where: { workspace_id: WS, phone: base.telefono } })) === 0, 'las solicitudes rechazadas no dejan clientes');
    // moto de otro cliente
    r = await api('POST', '/api/public/appointments', { ...base, telefono: phoneNew, mecanico_id: mA.id, moto_id: '00000000-0000-4000-8000-000000000000', fecha: pickDay() });
    ok(r.status === 400, 'moto_id que no es del cliente -> 400');
    r = await api('GET', `/api/public/appointments/availability?fecha=${pickDay()}&mecanico_id=${mHidden.id}`);
    ok(r.status === 400, 'availability con mecánico oculto -> 400');

    // ── 9. Choques de horario ────────────────────────────────────────────
    section('Mismo horario');
    r = await api('POST', '/api/public/appointments', {
        telefono: phoneNew, mecanico_id: mB.id, tipo_servicio: 'Otro', fecha: d1, hora: '10:00', moto_id: motos1[0].id,
    });
    ok(r.status === 409 && /a esa hora/i.test(r.json.error), 'mismo teléfono a la misma hora -> 409', JSON.stringify(r.json));
    const phoneB = newPhone();
    r = await api('POST', '/api/public/appointments', {
        nombre: 'Maria Lopez', telefono: phoneB, mecanico_id: mA.id, tipo_servicio: 'Afinación general', fecha: d1, hora: '10:00', moto_marca: 'Italika', moto_modelo: 'FT150',
    });
    ok(r.status === 409, 'mecánico A ocupado a esa hora -> 409', JSON.stringify(r.json));
    ok((await prisma.client.count({ where: { workspace_id: WS, phone: phoneB } })) === 0, 'el 409 no deja cliente a medias');

    // ── 10. Horarios por mecánico ────────────────────────────────────────
    section('Horarios por mecánico');
    const slotAt = (j, h) => j.slots.find((s) => s.hora === h)?.available;
    r = await api('GET', `/api/public/appointments/availability?fecha=${d1}&mecanico_id=${mA.id}`);
    ok(slotAt(r.json, '10:00') === false && slotAt(r.json, '11:00') === true, 'A: 10:00 ocupado, 11:00 libre');
    r = await api('GET', `/api/public/appointments/availability?fecha=${d1}&mecanico_id=${mB.id}`);
    ok(slotAt(r.json, '10:00') === true, 'B: 10:00 libre aunque A esté ocupado');
    r = await api('GET', `/api/public/appointments/availability?fecha=${d1}`);
    ok(slotAt(r.json, '10:00') === true, 'sin mecánico: cupo global (2) aún con lugar');
    r = await api('POST', '/api/public/appointments', {
        nombre: 'Maria Lopez', telefono: phoneB, mecanico_id: mB.id, tipo_servicio: 'Afinación general', fecha: d1, hora: '10:00', moto_marca: 'Italika', moto_modelo: 'FT150',
    });
    ok(r.status === 201, 'B sí puede atender a las 10:00');
    created.phones.push(phoneB);
    r = await api('GET', `/api/public/appointments/availability?fecha=${d1}&mecanico_id=${mNoPhone.id}`);
    ok(slotAt(r.json, '10:00') === false, 'con 2 citas a esa hora el cupo global cierra el horario para todos');
    r = await api('POST', '/api/public/appointments', {
        nombre: 'Sin Telefono', telefono: newPhone(), mecanico_id: mNoPhone.id, tipo_servicio: 'Afinación general', fecha: pickDay(), hora: '15:00', moto_marca: 'Honda', moto_modelo: 'X',
    });
    ok(r.status === 201, 'mecánico sin teléfono: la solicitud se guarda igual');
    await sleep(600);
    const evNoPhone = await prisma.appointmentEvent.findMany({ where: { appointment_id: r.json.id } });
    ok(evNoPhone.some((e) => e.type === 'wa_failed' && /sin teléfono/.test(e.detail || '')), 'queda evento wa_failed "sin teléfono"');

    // ── 11. Tope de pendientes por teléfono ──────────────────────────────
    section('Tope de solicitudes pendientes');
    const phoneC = newPhone(); created.phones.push(phoneC);
    const dC = pickDay();
    const hoursC = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'];
    const results = [];
    for (const h of hoursC) {
        const rr = await api('POST', '/api/public/appointments', {
            nombre: 'Muchas Citas', telefono: phoneC, mecanico_id: mB.id, tipo_servicio: 'Afinación general', fecha: dC, hora: h, moto_marca: 'Honda', moto_modelo: 'CB125',
        });
        results.push(rr.status);
    }
    ok(results.slice(0, 5).every((s) => s === 201) && results[5] === 429, 'varias citas sí; la 6a pendiente -> 429', results.join());
    ok((await prisma.motorcycle.count({ where: { client: { phone: phoneC } } })) === 1, 'las 5 citas reutilizaron la misma moto');

    // ── 12. Panel ────────────────────────────────────────────────────────
    section('Panel: Mis citas, detalle y confirmación');
    const admin = await prisma.profile.findFirst({ where: { email: 'local@motopartes.test' } });
    const tokA = tokenFor(mA, 'mechanic');
    const tokAdmin = tokenFor(admin, 'admin');
    r = await api('GET', '/api/appointments?mine=1', null, tokA);
    ok(r.status === 200 && r.json.length >= 3 && r.json.every((a) => a.assigned_mechanic_id === mA.id), 'mine=1 solo trae las citas del mecánico');
    ok(r.json[0].mechanic && r.json[0].mechanic.full_name === mA.full_name, 'cada fila trae mechanic {id, full_name}');
    r = await api('GET', '/api/appointments', null, tokA);
    ok(r.json.every((a) => a.assigned_mechanic_id === mA.id), 'sin mine=1 un mecánico NO ve las citas de otros (cada quien las suyas)');
    r = await api('GET', `/api/appointments/${appt1.id}`, null, tokA);
    ok(r.status === 200 && r.json.id === appt1.id && r.json.public_link && r.json.client?.full_name === 'Juan Pérez López' && r.json.mechanic?.id === mA.id, 'GET /:id trae la cita completa con enlace');
    r = await api('GET', '/api/appointments/no-es-un-id', null, tokA);
    ok(r.status === 404, 'GET /:id con id inválido -> 404');
    r = await api('GET', `/api/appointments/00000000-0000-4000-8000-000000000000`, null, tokA);
    ok(r.status === 404, 'GET /:id inexistente -> 404');
    r = await api('GET', '/api/appointments/attention-count', null, tokA);
    ok(r.status === 200 && typeof r.json.count === 'number', 'las rutas fijas (attention-count) siguen funcionando');
    r = await api('GET', `/api/appointments/${appt1.id}`);
    ok(r.status === 401, 'GET /:id sin sesión -> 401');

    sent.length = 0;
    r = await api('POST', `/api/appointments/${appt1.id}/accept`, {}, tokA);
    ok(r.status === 200, 'el mecánico acepta la cita', JSON.stringify(r.json));
    ok((await prisma.client.findUnique({ where: { id: cli.id } })).web_unconfirmed === false, 'al confirmar el cliente deja de estar "por confirmar"');
    await sleep(300);
    ok(sent.some((m) => String(m.phone).endsWith(phoneNew) && /confirmada/i.test(m.message) && /Te atiende: Zeta Maciel/.test(m.message)), 'la confirmación al cliente dice quién lo atiende');
    const stillThere = await prisma.client.findUnique({ where: { id: cli.id } });
    ok(!!stillThere, 'aceptar no borra nada');

    // Rechazar no borra al cliente
    const apptC = await prisma.appointment.findFirst({ where: { client_phone: phoneC }, orderBy: { created_at: 'asc' } });
    r = await api('POST', `/api/appointments/${apptC.id}/reject`, { reason: 'Sin refacciones' }, tokAdmin);
    ok(r.status === 200 && !!(await prisma.client.findFirst({ where: { workspace_id: WS, phone: phoneC } })), 'rechazar no borra al cliente');

    // Reasignar: deja de ser "pedido por el cliente" y avisa al nuevo
    sent.length = 0;
    r = await api('PUT', `/api/appointments/${apptC.id}`, { assigned_mechanic_id: mA.id }, tokAdmin);
    const reassigned = await prisma.appointment.findUnique({ where: { id: apptC.id } });
    ok(r.status === 200 && reassigned.assigned_mechanic_id === mA.id && reassigned.mechanic_requested === false, 'reasignar apaga mechanic_requested');
    await sleep(400);
    ok(sent.some((m) => String(m.phone).endsWith(mA.phone) && /te asignaron/i.test(m.message)), 'se avisa al mecánico asignado');

    // ── 13. Enlace del cliente (by-token) ────────────────────────────────
    section('Enlace del cliente respeta al mecánico');
    const apptT = await prisma.appointment.findFirst({ where: { client_phone: phoneNew, scheduled_date: { gte: new Date(`${d2}T00:00:00-06:00`), lt: new Date(`${d2}T23:59:59-06:00`) } } });
    const tok = apptT.public_token;
    r = await api('GET', `/api/public/appointments/by-token/${tok}`);
    ok(r.status === 200 && r.json.mecanico === mB.full_name, 'la vista del cliente muestra su mecánico');
    ok(!/"(phone|client_phone|assigned_mechanic_id|mechanic_id)"/.test(r.text), 'la vista no expone teléfono ni ids internos');
    // availability con token usa el mecánico de la cita: hago que B esté ocupado el 11:00 de d1 con otra cita? Mejor: choose a un horario ocupado por B
    const dX = pickDay();
    const phoneD = newPhone(); created.phones.push(phoneD);
    await api('POST', '/api/public/appointments', { nombre: 'Ocupa B', telefono: phoneD, mecanico_id: mB.id, tipo_servicio: 'Afinación general', fecha: dX, hora: '16:00', moto_marca: 'Honda', moto_modelo: 'Y' });
    r = await api('GET', `/api/public/appointments/availability?fecha=${dX}&token=${tok}`);
    ok(slotAt(r.json, '16:00') === false && slotAt(r.json, '17:00') === true, 'availability con token usa la agenda del mecánico de la cita');
    r = await api('POST', `/api/public/appointments/by-token/${tok}/choose`, { fecha: dX, hora: '16:00' });
    ok(r.status === 409, 'choose a un horario ocupado por su mecánico -> 409');
    sent.length = 0;
    r = await api('POST', `/api/public/appointments/by-token/${tok}/choose`, { fecha: dX, hora: '17:00' });
    ok(r.status === 200 && r.json.mecanico === mB.full_name, 'choose a un horario libre -> 200 y conserva el mecánico');
    ok((await prisma.appointment.findUnique({ where: { id: apptT.id } })).assigned_mechanic_id === mB.id, 'assigned_mechanic_id no se pierde');
    await sleep(500);
    ok(sent.some((m) => String(m.phone).endsWith(mB.phone) && /cambiar el horario/i.test(m.message)), 'se avisa al mecánico del cambio de horario');

    // Propuesta aceptada por el cliente -> cliente confirmado
    const phoneE = newPhone(); created.phones.push(phoneE);
    const dE = pickDay();
    r = await api('POST', '/api/public/appointments', { nombre: 'Prop Cliente', telefono: phoneE, mecanico_id: mA.id, tipo_servicio: 'Afinación general', fecha: dE, hora: '09:00', moto_marca: 'Suzuki', moto_modelo: 'GN125' });
    const idE = r.json.id;
    const newWhen = new Date(`${pickDay()}T14:00:00-06:00`).toISOString();
    r = await api('POST', `/api/appointments/${idE}/propose`, { scheduled_date: newWhen, note: 'Otro día' }, tokA);
    ok(r.status === 200, 'el mecánico propone otra fecha');
    const tokE = (await prisma.appointment.findUnique({ where: { id: idE } })).public_token;
    r = await api('POST', `/api/public/appointments/by-token/${tokE}/accept`);
    ok(r.status === 200 && r.json.status === 'confirmed', 'el cliente acepta la propuesta');
    ok((await prisma.client.findFirst({ where: { workspace_id: WS, phone: phoneE } })).web_unconfirmed === false, 'aceptar la propuesta también quita "por confirmar"');
    r = await api('POST', `/api/public/appointments/by-token/${tokE}/cancel`);
    ok(r.status === 200 && r.json.status === 'cancelled', 'cancelar desde el enlace funciona');
    ok(!!(await prisma.client.findFirst({ where: { workspace_id: WS, phone: phoneE } })), 'cancelar no borra al cliente');

    // ── 14. Límites de intentos (API con límites bajos) ──────────────────
    section('Límites del lookup');
    const lim = startApi(PORT_LIM, { LOOKUP_IP_PER_MIN: '3', LOOKUP_PHONE_PER_DAY: '2' }); servers.push(lim);
    await waitUp(PORT_LIM);
    const L = (b) => call(`http://localhost:${PORT_LIM}`, 'POST', '/api/public/lookup', b);
    const pl = newPhone();
    ok((await L({ telefono: pl })).status === 200 && (await L({ telefono: pl })).status === 200, 'dos consultas del mismo número pasan');
    r = await L({ telefono: pl });
    ok(r.status === 429, 'la 3a consulta del mismo número en el día -> 429 (límite por teléfono)', String(r.status));
    r = await L({ telefono: newPhone() });
    ok(r.status === 429, 'por IP: pasando 3 por minuto -> 429 (límite por IP)', String(r.status));
} catch (e) {
    fail++;
    console.log('\nERROR en el e2e:', e);
    exitCode = 1;
} finally {
    servers.forEach((s) => s.kill());
    bot.close();
    try {
        // Solo lo que este script creó.
        const mech = created.profiles;
        const phones = [...myPhones];
        const appts = await prisma.appointment.findMany({ where: { OR: [{ assigned_mechanic_id: { in: mech } }, { client_phone: { in: phones } }] }, select: { id: true } });
        const ids = appts.map((a) => a.id);
        await prisma.appointmentEvent.deleteMany({ where: { appointment_id: { in: ids } } });
        await prisma.appointment.deleteMany({ where: { id: { in: ids } } });
        const clients = await prisma.client.findMany({ where: { workspace_id: WS, phone: { in: phones } }, select: { id: true } });
        await prisma.motorcycle.deleteMany({ where: { client_id: { in: clients.map((c) => c.id) } } });
        await prisma.client.deleteMany({ where: { id: { in: clients.map((c) => c.id) } } });
        await prisma.whatsappSession.deleteMany({ where: { mechanic_id: { in: mech } } });
        await prisma.membership.deleteMany({ where: { profile_id: { in: mech } } });
        await prisma.profile.deleteMany({ where: { id: { in: mech } } });
    } catch (e) { console.log('limpieza:', e.message); }
    await prisma.$disconnect();
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : exitCode);
