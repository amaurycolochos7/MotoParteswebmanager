// Real integration test for the ELIHU workflow, run IN-PROCESS with Fastify
// `app.inject` against a REAL PostgreSQL (docker-compose.local.yml on :5434).
//
//   docker compose -f docker-compose.local.yml up -d
//   cd apps/api && node test/_elihu_e2e.mjs
//
// It exercises the actual routes + auth + workspace scoping + permission
// middleware. Not part of the unit `npm test` glob (needs a DB).

import 'dotenv/config';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../src/middleware/auth.js';
import { installWorkspaceStore } from '../src/middleware/workspace.js';

import clientsRoutes from '../src/routes/clients.js';
import quotationsRoutes from '../src/routes/quotations.js';
import ordersRoutes from '../src/routes/orders.js';
import orderPaymentsRoutes from '../src/routes/order-payments.js';
import earningsRoutes from '../src/routes/earnings.js';
import statusesRoutes from '../src/routes/statuses.js';

const db = new PrismaClient();
let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
    if (cond) { pass++; results.push(`PASS  ${name}`); }
    else { fail++; results.push(`FAIL  ${name} ${extra}`); }
}

async function buildApp() {
    const app = Fastify({ logger: false });
    app.addHook('onRequest', async (req) => installWorkspaceStore(req));
    await app.register(clientsRoutes, { prefix: '/api/clients' });
    await app.register(quotationsRoutes, { prefix: '/api/quotations' });
    await app.register(ordersRoutes, { prefix: '/api/orders' });
    await app.register(orderPaymentsRoutes, { prefix: '/api/order-payments' });
    await app.register(earningsRoutes, { prefix: '/api/earnings' });
    await app.register(statusesRoutes, { prefix: '/api/statuses' });
    await app.ready();
    return app;
}

const j = (s) => JSON.parse(s);

async function main() {
    // ---- 0. Verify migration 007 results on the real DB (from earlier apply) ----
    const autorizadaGlobal = await db.orderStatus.findFirst({ where: { name: 'Autorizada', workspace_id: null } });
    check('Migración 007: estado global "Autorizada" existe', !!autorizadaGlobal);
    const oldOrder = await db.order.findFirst({ where: { order_number: 'OLD-0001' } });
    check('Migración 007: orden existente OLD-0001 sobrevive', !!oldOrder);
    const oldClient = await db.client.findFirst({ where: { id: '11111111-1111-1111-1111-111111111111' } });
    check('Migración 007: cliente existente sobrevive', !!oldClient);
    const backfilled = await db.orderPayment.findFirst({ where: { order_id: '22222222-2222-2222-2222-222222222222' } });
    check('Migración 007: advance_payment (200) backfilled a order_payments', backfilled && Number(backfilled.amount) === 200, backfilled ? `amount=${backfilled.amount}` : 'no row');

    // ---- 1. Setup workspace, master + auxiliary, memberships, statuses ----
    const tag = Date.now();
    const ws = await db.workspace.create({ data: { slug: `e2e-${tag}`, name: 'Taller E2E', is_active: true } });
    const master = await db.profile.create({ data: { email: `master-${tag}@e2e.test`, full_name: 'ELIHU Maestro', role: 'mechanic', is_master_mechanic: true } });
    const aux = await db.profile.create({ data: { email: `aux-${tag}@e2e.test`, full_name: 'Auxiliar', role: 'mechanic', requires_approval: true } });
    await db.membership.create({ data: { workspace_id: ws.id, profile_id: master.id, role: 'mechanic' } });
    await db.membership.create({ data: { workspace_id: ws.id, profile_id: aux.id, role: 'auxiliary' } });
    for (const s of [
        { name: 'Registrada', display_order: 1, is_terminal: false },
        { name: 'Autorizada', display_order: 2, is_terminal: false },
        { name: 'Lista para Entregar', display_order: 6, is_terminal: false },
        { name: 'Entregada', display_order: 7, is_terminal: true },
    ]) {
        await db.orderStatus.create({ data: { ...s, workspace_id: ws.id, color: '#888' } });
    }

    const masterTok = generateToken({ id: master.id, email: master.email, role: master.role, workspace_id: ws.id, memberships: [{ workspace_id: ws.id, role: 'mechanic' }] });
    const auxTok = generateToken({ id: aux.id, email: aux.email, role: aux.role, workspace_id: ws.id, memberships: [{ workspace_id: ws.id, role: 'auxiliary' }] });
    // Mirror frontend api.js: only set content-type when there is a JSON body
    // (Fastify rejects body-less requests that declare application/json with 400).
    const H = (tok, hasBody) => {
        const h = { authorization: `Bearer ${tok}`, 'x-workspace-id': ws.id };
        if (hasBody) h['content-type'] = 'application/json';
        return h;
    };

    const app = await buildApp();
    const inj = (method, url, tok, payload) => app.inject({ method, url, headers: H(tok, payload !== undefined), payload: payload !== undefined ? JSON.stringify(payload) : undefined });

    // ---- 2. Cliente: crear + buscar por nombre + historial ----
    let r = await inj('POST', '/api/clients', masterTok, { full_name: 'Juana Pérez Gómez', phone: '5557778888' });
    check('Crear cliente', r.statusCode === 200, `code=${r.statusCode}`);
    const client = j(r.payload);

    r = await inj('GET', '/api/clients/search?q=juana', masterTok);
    const sr = j(r.payload);
    check('Buscar cliente por nombre (sin acento, parcial)', r.statusCode === 200 && Array.isArray(sr) && sr.some(c => c.id === client.id), `code=${r.statusCode} n=${Array.isArray(sr) ? sr.length : 'NA'}`);

    r = await inj('GET', `/api/clients/${client.id}/history`, masterTok);
    check('Historial del cliente', r.statusCode === 200 && j(r.payload).id === client.id, `code=${r.statusCode}`);

    // ---- 3. Cotización -> aceptar -> convertir -> Autorizada ----
    r = await inj('POST', '/api/quotations', masterTok, {
        client_id: client.id, customer_complaint: 'No enciende', notes: 'Diag: batería',
        labor: [{ name: 'Revisión eléctrica', price: 500 }], parts: [],
    });
    check('Crear cotización', r.statusCode === 200 || r.statusCode === 201, `code=${r.statusCode}`);
    const quote = j(r.payload);

    r = await inj('POST', `/api/quotations/${quote.id}/convert`, masterTok, {});
    check('Convertir cotización a orden', r.statusCode === 200 && j(r.payload).order_id, `code=${r.statusCode}`);
    const orderId = j(r.payload).order_id;

    // doble conversión idempotente
    r = await inj('POST', `/api/quotations/${quote.id}/convert`, masterTok, {});
    check('Evitar doble conversión (already_converted)', r.statusCode === 200 && j(r.payload).already_converted === true, `code=${r.statusCode}`);

    let order = await db.order.findUnique({ where: { id: orderId }, include: { status: true } });
    check('Orden nace "Autorizada"', order?.status?.name === 'Autorizada', `status=${order?.status?.name}`);

    // ---- 4. Costos (mano de obra 500) ----
    r = await inj('PUT', `/api/orders/${orderId}/costs`, masterTok, { labor_total: 500, parts: [] });
    check('Maestro fija costos (labor 500)', r.statusCode === 200, `code=${r.statusCode}`);

    // ---- 5. Fecha estimada de entrega ----
    r = await inj('PUT', `/api/orders/${orderId}`, masterTok, { estimated_delivery_at: new Date(Date.now() + 3 * 864e5).toISOString() });
    check('Fecha estimada de entrega se guarda', r.statusCode === 200 && !!j(r.payload).estimated_delivery_at, `code=${r.statusCode}`);

    // ---- 6. Comisión variable 30% sobre mano de obra ----
    r = await inj('PUT', `/api/earnings/order/${orderId}/commission`, masterTok, { commission_rate: 30 });
    check('Fijar comisión 30%', r.statusCode === 200, `code=${r.statusCode}`);
    let comm = j(r.payload).earning;
    check('Comisión = 150 (30% de 500, sobre mano de obra)', Number(comm.earned_amount) === 150, `amount=${comm.earned_amount}`);
    check('Comisión inicia PENDING_PAYMENT', comm.commission_status === 'PENDING_PAYMENT', `status=${comm.commission_status}`);

    // ---- 7. Primer abono parcial ----
    r = await inj('POST', '/api/order-payments', masterTok, { order_id: orderId, amount: 200, payment_method: 'efectivo' });
    check('Registrar primer abono (200)', r.statusCode === 201, `code=${r.statusCode}`);
    check('Saldo pendiente = 300 tras abono', Number(j(r.payload).finance.balance) === 300, `balance=${j(r.payload).finance.balance}`);
    check('Estado de pago = Parcial', j(r.payload).finance.payment_status === 'Parcial');

    r = await inj('GET', `/api/earnings/order/${orderId}`, masterTok);
    check('Comisión NO se libera con abono parcial', j(r.payload).earnings[0].commission_status === 'PENDING_PAYMENT', `status=${j(r.payload).earnings[0].commission_status}`);

    // bloquear sobrepago
    r = await inj('POST', '/api/order-payments', masterTok, { order_id: orderId, amount: 9999 });
    check('Bloquear sobrepago (400)', r.statusCode === 400, `code=${r.statusCode}`);
    // bloquear monto 0
    r = await inj('POST', '/api/order-payments', masterTok, { order_id: orderId, amount: 0 });
    check('Bloquear monto 0 (400)', r.statusCode === 400, `code=${r.statusCode}`);

    // ---- 8. Pago final -> saldo 0 -> comisión READY_TO_PAY ----
    r = await inj('POST', '/api/order-payments', masterTok, { order_id: orderId, amount: 300, payment_method: 'transferencia' });
    check('Registrar pago final (300)', r.statusCode === 201, `code=${r.statusCode}`);
    check('Saldo 0 y Pagada', Number(j(r.payload).finance.balance) === 0 && j(r.payload).finance.payment_status === 'Pagada', `b=${j(r.payload).finance.balance}`);

    r = await inj('GET', `/api/earnings/order/${orderId}`, masterTok);
    check('Comisión READY_TO_PAY al liquidar', j(r.payload).earnings[0].commission_status === 'READY_TO_PAY', `status=${j(r.payload).earnings[0].commission_status}`);

    // ---- 9. Recibo ----
    const pay = await db.orderPayment.findFirst({ where: { order_id: orderId, cancelled_at: null }, orderBy: { created_at: 'asc' } });
    r = await inj('GET', `/api/order-payments/${pay.id}/receipt`, masterTok);
    check('Recibo con folio REC-', r.statusCode === 200 && /^REC-/.test(j(r.payload).receipt_number || ''), `folio=${j(r.payload).receipt_number}`);

    // ---- 10. Estado Lista para Entregar ----
    const listo = await db.orderStatus.findFirst({ where: { workspace_id: ws.id, name: 'Lista para Entregar' } });
    r = await inj('PUT', `/api/orders/${orderId}/status`, masterTok, { status_id: listo.id });
    check('Cambiar estado a "Lista para Entregar"', r.statusCode === 200 && j(r.payload).status?.name === 'Lista para Entregar', `code=${r.statusCode}`);

    // ================= PERMISOS: AUXILIAR =================
    r = await inj('POST', '/api/order-payments', auxTok, { order_id: orderId, amount: 50 });
    check('AUX 403 registrar pago', r.statusCode === 403, `code=${r.statusCode}`);
    r = await inj('PUT', `/api/orders/${orderId}/costs`, auxTok, { labor_total: 999, parts: [] });
    check('AUX 403 cambiar costos', r.statusCode === 403, `code=${r.statusCode}`);
    r = await inj('PUT', `/api/orders/${orderId}/paid`, auxTok, {});
    check('AUX 403 marcar pagada', r.statusCode === 403, `code=${r.statusCode}`);
    r = await inj('PUT', `/api/earnings/order/${orderId}/commission`, auxTok, { commission_rate: 50 });
    check('AUX 403 cambiar comisión', r.statusCode === 403, `code=${r.statusCode}`);
    r = await inj('DELETE', `/api/orders/${orderId}`, auxTok);
    check('AUX 403 borrar orden', r.statusCode === 403, `code=${r.statusCode}`);
    r = await inj('DELETE', `/api/clients/${client.id}`, auxTok);
    check('AUX 403 borrar cliente', r.statusCode === 403, `code=${r.statusCode}`);
    // Auxiliar SÍ puede crear cliente
    r = await inj('POST', '/api/clients', auxTok, { full_name: 'Cliente del Aux', phone: '5550009999' });
    check('AUX puede crear cliente', r.statusCode === 200, `code=${r.statusCode}`);
    // PUT money field ignored for aux (no 403 but money fields stripped)
    r = await inj('PUT', `/api/orders/${orderId}`, auxTok, { total_amount: 1 });
    const afterAuxPut = await db.order.findUnique({ where: { id: orderId } });
    check('AUX no puede alterar total vía PUT genérico (campo ignorado)', Number(afterAuxPut.total_amount) === 500, `total=${afterAuxPut.total_amount}`);

    // ================= MASTER puede =================
    r = await inj('PUT', `/api/earnings/order/${orderId}/commission`, masterTok, { commission_rate: 25 });
    check('MASTER puede cambiar comisión', r.statusCode === 200, `code=${r.statusCode}`);

    // ============ ENTREGA CON SALDO PENDIENTE (backend) ============
    // Segunda orden con saldo: cotización -> convertir -> costos 400 -> abono 100 (saldo 300)
    r = await inj('POST', '/api/quotations', masterTok, { client_id: client.id, labor: [{ name: 'Servicio 2', price: 400 }], parts: [] });
    const q2 = j(r.payload);
    r = await inj('POST', `/api/quotations/${q2.id}/convert`, masterTok, {});
    const order2 = j(r.payload).order_id;
    await inj('PUT', `/api/orders/${order2}/costs`, masterTok, { labor_total: 400, parts: [] });
    await inj('POST', '/api/order-payments', masterTok, { order_id: order2, amount: 100 });
    const entregada = await db.orderStatus.findFirst({ where: { workspace_id: ws.id, name: 'Entregada' } });

    r = await inj('PUT', `/api/orders/${order2}/status`, auxTok, { status_id: entregada.id, notes: 'intento' });
    check('AUX 403 entregar con saldo pendiente', r.statusCode === 403, `code=${r.statusCode}`);

    r = await inj('PUT', `/api/orders/${order2}/status`, masterTok, { status_id: entregada.id });
    check('MASTER 400 entregar con saldo SIN nota', r.statusCode === 400, `code=${r.statusCode}`);

    r = await inj('PUT', `/api/orders/${order2}/status`, masterTok, { status_id: entregada.id, notes: 'Cliente paga el resto el viernes' });
    check('MASTER entrega con saldo + nota → PASS', r.statusCode === 200 && j(r.payload).status?.name === 'Entregada', `code=${r.statusCode}`);
    const hist = await db.orderHistory.findFirst({ where: { order_id: order2, new_status: 'Entregada' }, orderBy: { created_at: 'desc' } });
    check('Nota de autorización registrada en historial', hist && /ENTREGA CON SALDO/.test(hist.notes || ''), `notes=${hist?.notes}`);

    // Orden principal (saldo 0) entrega normal
    r = await inj('PUT', `/api/orders/${orderId}/status`, masterTok, { status_id: entregada.id });
    check('Entregar orden SIN saldo (normal)', r.statusCode === 200 && j(r.payload).status?.name === 'Entregada', `code=${r.statusCode}`);

    await app.close();

    console.log('\n==== RESULTADOS E2E (DB real local) ====');
    results.forEach(l => console.log(l));
    console.log(`\nPASS=${pass}  FAIL=${fail}`);
    await db.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error('E2E crashed:', e); await db.$disconnect(); process.exit(2); });
