// E2E del lado del panel (clientes, motos, historial, ordenes, interruptor de citas en linea).
// Corre contra una API local ya levantada (por defecto http://127.0.0.1:3102) y la BD local.
//   DATABASE_URL=... JWT_SECRET=local-dev-only-change-me node test/_panel_e2e.mjs
// Crea datos con prefijo 998111 y los borra al terminar. No manda WhatsApp reales.
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://127.0.0.1:3102/api';
const SECRET = process.env.JWT_SECRET || 'local-dev-only-change-me';
const WS1 = '7b795e9a-c398-49f1-9ca0-aee971805172';
const ADMIN_ID = '5236d9b0-9508-415f-b27f-5e53415233bd';
const db = new PrismaClient();

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const sign = (id, role, ws) => jwt.sign({ id, email: `${id}@t.test`, role, workspace_id: ws }, SECRET, { expiresIn: '1h' });
async function call(method, path, token, body, ws = WS1) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': ws, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* sin cuerpo */ }
    return { status: res.status, json };
}

const created = { profiles: [], workspaces: [] };
async function cleanup() {
    const cl = await db.client.findMany({ where: { phone: { startsWith: '998111' } }, select: { id: true } });
    const ids = cl.map((c) => c.id);
    if (ids.length) {
        const orders = await db.order.findMany({ where: { client_id: { in: ids } }, select: { id: true } });
        const oids = orders.map((o) => o.id);
        if (oids.length) {
            await db.orderService.deleteMany({ where: { order_id: { in: oids } } });
            await db.orderPart.deleteMany({ where: { order_id: { in: oids } } });
            await db.orderHistory.deleteMany({ where: { order_id: { in: oids } } });
            await db.order.deleteMany({ where: { id: { in: oids } } });
        }
        await db.motorcycle.deleteMany({ where: { client_id: { in: ids } } });
        await db.client.deleteMany({ where: { id: { in: ids } } });
    }
    for (const w of created.workspaces) { await db.membership.deleteMany({ where: { workspace_id: w } }); await db.workspace.delete({ where: { id: w } }).catch(() => {}); }
    for (const p of created.profiles) { await db.membership.deleteMany({ where: { profile_id: p } }); await db.profile.delete({ where: { id: p } }).catch(() => {}); }
}

try {
    await cleanup();
    // ── Datos base ───────────────────────────────────────────────────────
    const stamp = Date.now();
    const m1 = await db.profile.create({ data: { email: `pb-m1-${stamp}@t.test`, full_name: 'Mecanico Uno PB', phone: '9980000001', role: 'mechanic' } });
    const m2 = await db.profile.create({ data: { email: `pb-m2-${stamp}@t.test`, full_name: 'Mecanico Dos PB', phone: null, role: 'mechanic' } });
    const owner2 = await db.profile.create({ data: { email: `pb-o2-${stamp}@t.test`, full_name: 'Dueno Otro Taller PB', role: 'admin' } });
    created.profiles.push(m1.id, m2.id, owner2.id);
    await db.membership.create({ data: { workspace_id: WS1, profile_id: m1.id, role: 'mechanic' } });
    await db.membership.create({ data: { workspace_id: WS1, profile_id: m2.id, role: 'mechanic' } });
    const ws2 = await db.workspace.create({ data: { name: `Otro Taller PB ${stamp}`, slug: `otro-pb-${stamp}` } });
    created.workspaces.push(ws2.id);
    await db.membership.create({ data: { workspace_id: ws2.id, profile_id: owner2.id, role: 'owner' } });

    const admin = sign(ADMIN_ID, 'admin', WS1);
    const mech1 = sign(m1.id, 'mechanic', WS1);
    const other = sign(owner2.id, 'admin', ws2.id);

    const statuses = await db.orderStatus.findMany({ where: { workspace_id: WS1 } });
    const ST = (n) => statuses.find((s) => s.name === n).id;

    // ── Clientes ─────────────────────────────────────────────────────────
    console.log('Clientes');
    let r = await call('POST', '/clients', admin, { phone: '+52 998 111 0001', full_name: 'Ana Prueba PB', preferred_mechanic_id: m1.id });
    ok(r.status === 200 && r.json.phone === '9981110001', 'POST normaliza telefono a 10 digitos', JSON.stringify(r.json));
    ok(r.json.preferred_mechanic?.full_name === 'Mecanico Uno PB', 'POST guarda mecanico preferido');
    const A = r.json;
    r = await call('POST', '/clients', admin, { phone: '9981110002', full_name: 'Beto Prueba PB' });
    const B = r.json;
    r = await call('POST', '/clients', admin, { phone: '9981110003', full_name: 'Carla Prueba PB' });
    const C = r.json;
    r = await call('POST', '/clients', admin, { phone: '529981110001', full_name: 'Duplicada' });
    ok(r.status === 409, 'telefono duplicado (con lada) da 409', String(r.status));
    r = await call('POST', '/clients', admin, { phone: '9981110009', full_name: 'X', preferred_mechanic_id: '11111111-1111-4111-8111-111111111111' });
    ok(r.status === 400, 'preferred_mechanic_id invalido en POST da 400', String(r.status));
    r = await call('PUT', `/clients/${B.id}`, admin, { preferred_mechanic_id: owner2.id });
    ok(r.status === 400, 'preferred_mechanic_id de otro taller en PUT da 400', String(r.status));
    r = await call('PUT', `/clients/${B.id}`, admin, { preferred_mechanic_id: m2.id });
    ok(r.status === 200 && r.json.preferred_mechanic_id === m2.id, 'PUT asigna mecanico preferido');
    r = await call('PUT', `/clients/${A.id}`, admin, { phone: '+52 998 111 0001' });
    ok(r.status === 200 && r.json.phone === '9981110001', 'PUT conserva/normaliza su propio telefono');
    r = await call('PUT', `/clients/${A.id}`, admin, { phone: '9981110002' });
    ok(r.status === 409, 'PUT al telefono de otro cliente da 409', String(r.status));
    r = await call('GET', '/clients/phone/+529981110002', admin);
    ok(r.json?.id === B.id, 'GET /clients/phone acepta variantes con lada');

    // ── Motos ────────────────────────────────────────────────────────────
    console.log('Motos');
    const mk = async (cid, brand, model, year, plates) => (await call('POST', '/motorcycles', admin, { client_id: cid, brand, model, year, plates })).json;
    const A1 = await mk(A.id, 'Honda', 'CB190R', 2021, 'PBA-111');
    const A2 = await mk(A.id, 'Italika', 'FT150', 2020, 'PBA-222');
    const B1 = await mk(B.id, 'Yamaha', 'FZ25', 2022, 'PBB-333');
    ok(A1?.id && A2?.id && B1?.id, 'se crean motos');
    r = await call('POST', '/motorcycles', admin, { client_id: A.id });
    ok(r.status === 400, 'moto sin marca/modelo da 400');
    r = await call('POST', '/motorcycles', other, { client_id: A.id, brand: 'X', model: 'Y' }, ws2.id);
    ok(r.status === 404, 'no se puede agregar moto a cliente de otro taller', String(r.status));

    // ── Ordenes: moto obligatoria ────────────────────────────────────────
    console.log('Ordenes');
    r = await call('POST', '/orders', admin, { client_id: A.id, mechanic_id: m1.id });
    ok(r.status === 400 && /Elige la moto/.test(r.json?.error || ''), 'cliente con 2 motos sin moto -> 400 Elige la moto', JSON.stringify(r.json));
    r = await call('POST', '/orders', admin, { client_id: A.id, motorcycle_id: B1.id });
    ok(r.status === 400 && /no pertenece/.test(r.json?.error || ''), 'moto de otro cliente -> 400', JSON.stringify(r.json));
    r = await call('POST', '/orders', admin, { client_id: B.id, mechanic_id: m2.id });
    ok(r.status === 200 && r.json.motorcycle_id === B1.id, 'cliente con 1 moto: se asigna sola', JSON.stringify(r.json?.error));
    r = await call('POST', '/orders', admin, { client_id: C.id });
    ok(r.status === 200 && !r.json.motorcycle_id, 'cliente sin motos: se permite sin moto');
    r = await call('POST', '/orders', admin, { client_id: '11111111-1111-4111-8111-111111111111' });
    ok(r.status === 400, 'cliente inexistente -> 400');
    r = await call('POST', '/orders', other, { client_id: A.id, motorcycle_id: A1.id }, ws2.id);
    ok(r.status === 400, 'cliente de otro taller no se puede usar (multi-tenant)', String(r.status));

    // Mecanico preferido: admin sin mechanic_id -> m1 ; mecanico no admin no se fuerza
    const t0 = Date.now();
    r = await call('POST', '/orders', admin, {
        client_id: A.id, motorcycle_id: A1.id,
        services: [{ name: 'Cambio de aceite', price: 350, cost: 100, quantity: 1 }],
    });
    const o1 = r.json;
    ok(r.status === 200 && o1.mechanic_id === m1.id, 'owner/admin sin mechanic_id: se usa el mecanico preferido', JSON.stringify(r.json?.error));
    ok(Date.now() - t0 < 5000, 'el aviso por WhatsApp no bloquea la respuesta', `${Date.now() - t0}ms`);
    r = await call('POST', '/orders', mech1, { client_id: B.id, motorcycle_id: B1.id });
    ok(r.status === 200 && r.json.mechanic_id === m1.id, 'mecanico sin mechanic_id: la orden queda a su nombre (cada quien ve lo suyo)', String(r.json?.mechanic_id));
    r = await call('POST', '/orders', admin, {
        client_id: A.id, motorcycle_id: A1.id, mechanic_id: m1.id,
        services: [{ name: 'Revision de frenos', price: 200, cost: 0, quantity: 1 }],
    });
    const o2 = r.json; // queda abierta
    r = await call('POST', '/orders', admin, {
        client_id: A.id, motorcycle_id: A2.id, mechanic_id: m1.id,
        services: [{ name: 'Cadena y sprockets', price: 500, cost: 200, quantity: 1 }],
    });
    const o3 = r.json;
    r = await call('POST', '/orders', admin, { client_id: A.id, motorcycle_id: A2.id, mechanic_id: m1.id, services: [{ name: 'Cancelado', price: 999, cost: 0, quantity: 1 }] });
    const o4 = r.json;
    await call('PUT', `/orders/${o1.id}/status`, admin, { status_id: ST('Entregada'), notes: 'Autorizado prueba' });
    await call('PUT', `/orders/${o3.id}/status`, admin, { status_id: ST('Entregada'), notes: 'Autorizado prueba' });
    await call('PUT', `/orders/${o4.id}/status`, admin, { status_id: ST('Cancelada'), notes: 'Cancelada prueba' });

    // ── Historial por moto ───────────────────────────────────────────────
    console.log('Historial por moto');
    r = await call('GET', `/motorcycles/${A1.id}/history`, admin);
    ok(r.status === 200, 'historial responde 200');
    ok(r.json.summary.services_count === 1, 'moto 1: 1 servicio hecho', JSON.stringify(r.json.summary));
    ok(r.json.summary.total_spent === 350, 'moto 1: total gastado 350', String(r.json.summary.total_spent));
    ok(r.json.summary.open_orders === 1, 'moto 1: 1 orden abierta');
    ok(r.json.timeline.length === 2, 'moto 1: 2 ordenes en la linea de tiempo');
    ok(new Date(r.json.timeline[0].created_at) >= new Date(r.json.timeline[1].created_at), 'linea de tiempo mas reciente primero');
    const t1 = r.json.timeline.find((t) => t.id === o1.id);
    ok(t1?.services?.[0]?.name === 'Cambio de aceite' && t1.services[0].quantity === 1, 'trae servicios con cantidad y precio');
    ok(t1?.mechanic?.full_name === 'Mecanico Uno PB', 'trae mecanico');
    ok(Number(t1?.total_amount) === 350 && t1.is_paid === false && t1.status?.is_terminal === true, 'trae total, pagado y estado');
    r = await call('GET', `/motorcycles/${A2.id}/history`, admin);
    ok(r.json.summary.services_count === 1 && r.json.summary.total_spent === 500, 'moto 2: la cancelada no suma', JSON.stringify(r.json.summary));
    ok(r.json.timeline.length === 2 && r.json.timeline.some((t) => t.status?.name === 'Cancelada'), 'moto 2: la cancelada si aparece en la linea de tiempo');
    r = await call('GET', `/motorcycles/${A1.id}/history`, other, null, ws2.id);
    ok(r.status === 404, 'otro taller no ve el historial (404)', String(r.status));

    // ── Lookup ───────────────────────────────────────────────────────────
    console.log('Lookup');
    r = await call('GET', '/clients/lookup?q=0001', admin);
    ok(r.status === 200 && r.json.some((c) => c.id === A.id), 'ultimos 4 digitos encuentra al cliente');
    const la = r.json.find((c) => c.id === A.id);
    ok(la.motorcycles.length === 2, 'trae sus motos');
    const lm1 = la.motorcycles.find((m) => m.id === A1.id);
    ok(lm1.services_count === 1 && lm1.open_orders === 1 && lm1.last_service_at, 'moto: services_count, open_orders y ultimo servicio', JSON.stringify(lm1));
    ok(la.preferred_mechanic?.full_name === 'Mecanico Uno PB', 'trae mecanico preferido');
    r = await call('GET', '/clients/lookup?q=998%20111%200002', admin);
    ok(r.json.length === 1 && r.json[0].id === B.id, 'telefono completo con espacios');
    r = await call('GET', '/clients/lookup?q=Ana%20Prueba', admin);
    ok(r.json.some((c) => c.id === A.id), 'por nombre');
    r = await call('GET', '/clients/lookup?q=pba-222', admin);
    ok(r.json.some((c) => c.id === A.id), 'por placas (sin importar mayusculas)');
    r = await call('GET', '/clients/lookup?q=99', admin);
    ok(Array.isArray(r.json) && r.json.length === 0, 'consulta de 2 digitos -> []');
    r = await call('GET', '/clients/lookup?q=0001', other, null, ws2.id);
    ok(r.status === 200 && r.json.length === 0, 'otro taller no ve estos clientes (multi-tenant)');

    // ── Cita web por confirmar ───────────────────────────────────────────
    console.log('Cita web por confirmar');
    await db.client.update({ where: { id: C.id }, data: { web_unconfirmed: true, origin: 'cita_web' } });
    r = await call('GET', '/clients?web_unconfirmed=1', admin);
    ok(r.json.some((c) => c.id === C.id) && !r.json.some((c) => c.id === A.id), 'filtro web_unconfirmed=1');
    r = await call('POST', '/orders', admin, { client_id: C.id });
    r = await call('GET', `/clients/${C.id}`, admin);
    ok(r.json.web_unconfirmed === false && r.json.origin === 'cita_web', 'al abrirle una orden deja de estar por confirmar');

    // ── Interruptor "Aparecer en citas en linea" ─────────────────────────
    console.log('Interruptor citas en linea');
    r = await call('GET', '/auth/users', admin);
    const u1 = r.json.find((u) => u.id === m1.id);
    ok(u1?.online_booking_visible === true && u1.phone === '9980000001', 'el listado trae online_booking_visible y phone');
    ok(r.json.find((u) => u.id === m2.id)?.phone === null, 'el listado deja ver quien no tiene telefono');
    r = await call('PATCH', `/auth/users/${m1.id}/online-booking`, admin, { visible: false });
    ok(r.status === 200 && r.json.online_booking_visible === false, 'admin lo apaga');
    r = await call('GET', '/auth/users', admin);
    ok(r.json.find((u) => u.id === m1.id).online_booking_visible === false, 'el listado refleja el cambio');
    r = await call('PATCH', `/auth/users/${m1.id}/online-booking`, mech1, { visible: true });
    ok(r.status === 403, 'un mecanico no puede cambiarlo (403)', String(r.status));
    r = await call('PATCH', `/auth/users/${m1.id}/online-booking`, admin, { visible: 'si' });
    ok(r.status === 400, 'valor no booleano -> 400');
    r = await call('PATCH', `/auth/users/${owner2.id}/online-booking`, admin, { visible: true });
    ok(r.status === 404, 'persona de otro taller -> 404', String(r.status));
    r = await call('PATCH', `/auth/users/${m1.id}/online-booking`, admin, { visible: true });
    ok(r.status === 200 && r.json.online_booking_visible === true, 'admin lo vuelve a encender');
} catch (e) {
    fail++;
    console.log('ERROR', e);
} finally {
    await cleanup();
    await db.$disconnect();
    console.log(`\n${pass} ok, ${fail} fallos`);
    process.exit(fail ? 1 : 0);
}
