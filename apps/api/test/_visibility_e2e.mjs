// Separación por mecánico: órdenes, cotizaciones, cobros, fotos, citas, estadísticas. Clientes y WhatsApp siguen compartidos.
//   cd apps/api && DATABASE_URL=postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes node test/_visibility_e2e.mjs
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';

const API = 3185, SECRET = 'local-dev-only-change-me';
const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true } });
const admin = await prisma.profile.findFirst({ where: { memberships: { some: { workspace_id: ws.id, role: { in: ['owner', 'admin'] } } } }, select: { id: true, email: true } });
const TAG = `vis${Date.now()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ', m); } else { fail++; console.log('  FAIL ', m); } };
const tok = (p, role) => jwt.sign({ id: p.id, email: p.email, role, workspace_id: ws.id }, SECRET, { expiresIn: '1h' });

const mk = async (name, { master = false, aux = false, supervisor = null } = {}) => {
    const p = await prisma.profile.create({ data: { email: `${TAG}-${name}@test.local`, full_name: `${name} ${TAG}`, role: 'mechanic', is_master_mechanic: master, requires_approval: aux, supervised_by: supervisor } });
    await prisma.membership.create({ data: { workspace_id: ws.id, profile_id: p.id, role: aux ? 'auxiliary' : 'mechanic', permissions: { can_view_inbox: true } } });
    return p;
};
const M1 = await mk('M1', { master: true }); const M2 = await mk('M2', { master: true });
const AUX = await mk('AUX', { aux: true, supervisor: M1.id }); const ME = await mk('ME');
const status = await prisma.orderStatus.findFirst({ where: { workspace_id: ws.id, is_terminal: false } });
const client = await prisma.client.create({ data: { workspace_id: ws.id, full_name: `${TAG} Cliente compartido`, phone: '9615550001' } });
const order = (n, mechanic) => prisma.order.create({ data: { workspace_id: ws.id, order_number: `${TAG}-${n}`, client_id: client.id, mechanic_id: mechanic?.id || null, status_id: status.id } });
const O1 = await order('O1', M1); const O2 = await order('O2', M2); const O3 = await order('O3', AUX); const O4 = await order('O4', null);
const quote = (n, by) => prisma.quotation.create({ data: { workspace_id: ws.id, quotation_number: `${TAG}-${n}`, client_id: client.id, created_by: by?.id || null } });
const Q1 = await quote('Q1', M1); const Q2 = await quote('Q2', M2); const Q3 = await quote('Q3', AUX);
const appt = (m) => prisma.appointment.create({ data: { workspace_id: ws.id, client_id: client.id, assigned_mechanic_id: m.id, scheduled_date: new Date(Date.now() + 86400000), status: 'scheduled' } });
const A1 = await appt(M1); const A2 = await appt(M2);
await prisma.orderPhoto.create({ data: { order_id: O2.id, workspace_id: ws.id, url: 'x', uploaded_by: M2.id, expires_at: new Date(Date.now() + 86400000) } }).catch(() => {});

const cleanup = async () => {
    const orders = (await prisma.order.findMany({ where: { order_number: { startsWith: TAG } }, select: { id: true } })).map((o) => o.id);
    await prisma.orderPhoto.deleteMany({ where: { order_id: { in: orders } } });
    await prisma.orderPayment.deleteMany({ where: { order_id: { in: orders } } });
    await prisma.mechanicEarning.deleteMany({ where: { order_id: { in: orders } } });
    await prisma.orderHistory.deleteMany({ where: { order_id: { in: orders } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.quotation.deleteMany({ where: { quotation_number: { startsWith: TAG } } });
    await prisma.appointment.deleteMany({ where: { id: { in: [A1.id, A2.id] } } });
    await prisma.client.deleteMany({ where: { full_name: { startsWith: TAG } } });
    await prisma.membership.deleteMany({ where: { profile_id: { in: [M1.id, M2.id, AUX.id, ME.id] } } });
    await prisma.profile.deleteMany({ where: { id: { in: [M1.id, M2.id, AUX.id, ME.id] } } });
};
const api = spawn('node', ['src/index.js'], { env: { ...process.env, PORT: String(API), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'k', WHATSAPP_BOT_INTERNAL_URL: 'http://localhost:1', LOG_LEVEL: 'silent' }, stdio: 'ignore' });
try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API}/api/health`)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
    const as = (t) => {
        const H = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
        const call = (method, p, body) => fetch(`http://localhost:${API}/api${p}`, { method, headers: body ? H : { Authorization: H.Authorization }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
        return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b || {}), put: (p, b) => call('PUT', p, b || {}), del: (p) => call('DELETE', p) };
    };
    const adm = as(tok(admin, 'admin')); const m1 = as(tok(M1, 'mechanic')); const m2 = as(tok(M2, 'mechanic')); const aux = as(tok(AUX, 'mechanic')); const me = as(tok(ME, 'mechanic'));
    const mine = (rows, ids) => (rows || []).filter((r) => ids.includes(r.id)).map((r) => r.id).sort();
    const idsO = [O1.id, O2.id, O3.id, O4.id].sort();

    console.log('== órdenes: cada quien ve solo las suyas');
    ok(JSON.stringify(mine((await adm.get('/orders')).json, idsO)) === JSON.stringify(idsO), 'dueño/administrador: ve todas (incluida la sin mecánico)');
    ok(JSON.stringify(mine((await m1.get('/orders')).json, idsO)) === JSON.stringify([O1.id, O3.id].sort()), 'maestro 1: las suyas y las de su auxiliar');
    ok(JSON.stringify(mine((await m2.get('/orders')).json, idsO)) === JSON.stringify([O2.id]), 'maestro 2: solo la suya');
    ok(JSON.stringify(mine((await aux.get('/orders')).json, idsO)) === JSON.stringify([O3.id]), 'auxiliar: solo la suya (no ve las de su maestro)');
    ok(mine((await me.get('/orders')).json, idsO).length === 0, 'mecánico sin órdenes: no ve ninguna de las demás');
    let r = await m1.get(`/orders/${O2.id}`); ok(r.status === 404, `maestro 1 no abre la orden de maestro 2 (${r.status})`);
    r = await m1.get(`/orders/${O3.id}`); ok(r.status === 200, 'pero sí la de su auxiliar');
    r = await m2.get(`/orders/${O2.id}`); ok(r.status === 200, 'maestro 2 abre la suya');
    r = await adm.get(`/orders/${O2.id}`); ok(r.status === 200, 'el administrador abre cualquiera');
    r = await m1.put(`/orders/${O2.id}/costs`, { labor_total: 999, parts: [] }); ok(r.status === 404, `no puede cambiar costos de una orden ajena (${r.status} ${JSON.stringify(r.json).slice(0,80)})`);
    r = await m1.put(`/orders/${O2.id}/status`, { status_id: status.id }); ok(r.status === 404, 'ni su estado');
    r = await m1.del(`/orders/${O2.id}`); ok(r.status === 404, 'ni borrarla');
    r = await m1.get(`/orders?mechanicId=${M2.id}`); ok(mine(r.json, idsO).length === 0, 'pedir "?mechanicId=otro" tampoco la entrega');

    console.log('== cobros, fotos y avances de órdenes ajenas');
    r = await m1.get(`/order-payments/order/${O2.id}`); ok(r.status === 404, 'ver pagos de orden ajena: 404');
    r = await m1.post('/order-payments', { order_id: O2.id, amount: 10, payment_method: 'efectivo' }); ok(r.status === 404, 'registrar un pago en orden ajena: 404');
    r = await m1.get(`/photos?orderId=${O2.id}`); ok(r.status === 404, 'ver fotos de orden ajena: 404');
    r = await m1.get('/photos'); ok(r.status === 200 && (r.json || []).every((p) => p.order_id !== O2.id), 'la lista general de fotos no incluye las ajenas');
    r = await m1.get(`/order-updates?orderId=${O2.id}`); ok(r.status === 404, 'ver avances de orden ajena: 404');
    r = await m2.get(`/order-payments/order/${O2.id}`); ok(r.status === 200, 'el dueño de la orden sí ve sus pagos');

    console.log('== cotizaciones: separadas');
    const idsQ = [Q1.id, Q2.id, Q3.id].sort();
    ok(JSON.stringify(mine((await adm.get('/quotations')).json, idsQ)) === JSON.stringify(idsQ), 'dueño/administrador: ve todas');
    ok(JSON.stringify(mine((await m1.get('/quotations')).json, idsQ)) === JSON.stringify([Q1.id, Q3.id].sort()), 'maestro 1: las suyas y las de su auxiliar');
    ok(JSON.stringify(mine((await m2.get('/quotations')).json, idsQ)) === JSON.stringify([Q2.id]), 'maestro 2: solo la suya');
    ok(mine((await me.get('/quotations')).json, idsQ).length === 0, 'mecánico sin cotizaciones: ninguna ajena');
    r = await m1.get(`/quotations/${Q2.id}`); ok(r.status === 404, 'maestro 1 no abre la cotización de maestro 2');
    r = await m1.del(`/quotations/${Q2.id}`); ok(r.status === 404, 'ni la borra');
    r = await m1.put(`/quotations/${Q2.id}`, { notes: 'x' }); ok(r.status === 404, 'ni la edita');
    r = await m1.get(`/quotations/${Q1.id}`); ok(r.status === 200, 'abre la suya');
    r = await m1.get(`/quotation-pdf/${Q2.id}/download`); ok(r.status === 404, 'ni descarga su PDF');

    console.log('== citas: cada quien las suyas; días sin servicio compartidos');
    const idsA = [A1.id, A2.id].sort();
    ok(JSON.stringify(mine((await m1.get('/appointments')).json, idsA)) === JSON.stringify([A1.id]), 'maestro 1: solo su cita');
    ok(JSON.stringify(mine((await adm.get('/appointments')).json, idsA)) === JSON.stringify(idsA), 'administrador: todas');
    r = await m1.get(`/appointments/${A2.id}`); ok(r.status === 404, 'no abre la cita de otro');
    r = await m1.put(`/appointments/${A2.id}`, { notes: 'x' }); ok(r.status === 404, 'ni la edita');
    r = await m1.get(`/appointments/${A1.id}`); ok(r.status === 200, 'abre la suya');
    r = await m1.get('/appointments/blocked-days'); ok(r.status === 200, 'los días sin servicio siguen siendo del taller');

    console.log('== crear órdenes y estadísticas');
    r = await m1.post('/orders', { client_id: client.id, mechanic_id: M2.id }); const created = r.json;
    ok(r.status === 200 || r.status === 201, `maestro 1 crea una orden (${r.status})`);
    if (created?.id) await prisma.order.update({ where: { id: created.id }, data: { order_number: `${TAG}-N1` } }).catch(() => {});
    ok(created?.mechanic_id === M1.id, 'aunque pida asignarla a otro maestro, queda a su nombre');
    r = await adm.post('/orders', { client_id: client.id, mechanic_id: M2.id });
    if (r.json?.id) await prisma.order.update({ where: { id: r.json.id }, data: { order_number: `${TAG}-N2` } }).catch(() => {});
    ok(r.json?.mechanic_id === M2.id, 'el administrador sí puede asignarla a quien quiera');
    const st = (await m2.get('/stats/dashboard')).json;
    ok(st?.activeOrders === 2, `estadísticas del maestro 2: solo cuenta lo suyo — su orden y la que le asignó el administrador (${st?.activeOrders})`);

    console.log('== lo que SÍ es compartido: clientes y WhatsApp');
    r = await m2.get('/clients'); ok(r.status === 200 && (r.json || []).some((c) => c.id === client.id), 'la lista de clientes es de todos');
    r = await m1.get(`/orders/client/${client.id}`); ok(r.status === 200 && mine(r.json, idsO).length === 4, 'el historial del cliente muestra todo su trabajo (es del cliente)');
    r = await m2.get('/inbox/conversations'); ok(r.status === 200, 'Conversaciones (WhatsApp) sigue compartido');
} finally {
    api.kill();
    await new Promise((x) => setTimeout(x, 300));
    await cleanup().catch((e) => console.log('limpieza:', e.message));
    await prisma.$disconnect();
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
