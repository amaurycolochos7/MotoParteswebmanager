// Comisión del mecánico: se crea al guardar la mano de obra, se libera al liquidar (abonos) y NO se pierde ni se pisa.
//   cd apps/api && DATABASE_URL=postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes node test/_commission_e2e.mjs
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';

const API = 3184, SECRET = 'local-dev-only-change-me';
const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true } });
const admin = await prisma.profile.findFirst({ where: { memberships: { some: { workspace_id: ws.id, role: { in: ['owner', 'admin'] } } } }, select: { id: true, email: true } });
const TAG = `com${Date.now()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ', m); } else { fail++; console.log('  FAIL ', m); } };
const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin', workspace_id: ws.id }, SECRET, { expiresIn: '1h' });

const mech = await prisma.profile.create({ data: { email: `${TAG}@test.local`, full_name: `Mecanico ${TAG}`, role: 'mechanic', commission_percentage: 100 } });
await prisma.membership.create({ data: { workspace_id: ws.id, profile_id: mech.id, role: 'mechanic' } });
const status = await prisma.orderStatus.findFirst({ where: { workspace_id: ws.id, is_terminal: false } });
const client = await prisma.client.create({ data: { workspace_id: ws.id, full_name: `${TAG} Cliente`, phone: '9617770001' } });
const mkOrder = (n) => prisma.order.create({ data: { workspace_id: ws.id, order_number: `${TAG}-${n}`, client_id: client.id, mechanic_id: mech.id, status_id: status.id } });
const orders = [];
const cleanup = async () => {
    const ids = (await prisma.order.findMany({ where: { order_number: { startsWith: TAG } }, select: { id: true } })).map((o) => o.id);
    await prisma.mechanicEarning.deleteMany({ where: { order_id: { in: ids } } });
    await prisma.orderPayment.deleteMany({ where: { order_id: { in: ids } } });
    await prisma.orderPart.deleteMany({ where: { order_id: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.client.deleteMany({ where: { id: client.id } });
    await prisma.membership.deleteMany({ where: { profile_id: mech.id } });
    await prisma.profile.deleteMany({ where: { id: mech.id } });
};
const api = spawn('node', ['src/index.js'], { env: { ...process.env, PORT: String(API), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'k', WHATSAPP_BOT_INTERNAL_URL: 'http://localhost:1', LOG_LEVEL: 'silent' }, stdio: 'ignore' });
try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API}/api/health`)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
    const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const call = (method, p, body) => fetch(`http://localhost:${API}/api${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const summary = async () => (await call('GET', `/earnings/summary?mechanicId=${mech.id}&period=all`)).body;
    const rowsOf = (id) => prisma.mechanicEarning.findMany({ where: { order_id: id } });

    console.log('== A) guardar costos (mano de obra $50 + refacción $30) y pagar TODO por abonos');
    const A = await mkOrder('A'); orders.push(A);
    let r = await call('PUT', `/orders/${A.id}/costs`, { labor_total: 50, parts: [{ name: 'Aceite', price: 30, quantity: 1 }] });
    ok(r.status === 200, `costos guardados (${r.status})`);
    let rows = await rowsOf(A.id);
    ok(rows.length === 1 && Number(rows[0].earned_amount) === 50 && rows[0].commission_status === 'PENDING_PAYMENT', `al guardar la mano de obra ya hay comisión pendiente de $50 (${rows.length} fila(s), ${rows[0]?.commission_status})`);
    let s = await summary();
    ok(s.por_cobrar === 50 && s.liberada === 0 && s.orders_count === 1, `el resumen la muestra como "por cobrar" ($${s.por_cobrar})`);
    r = await call('POST', '/order-payments', { order_id: A.id, amount: 80, payment_method: 'efectivo' });
    ok(r.status === 201 && r.body.finance?.is_fully_paid === true, 'se liquida la orden con un abono de $80');
    rows = await rowsOf(A.id);
    ok(rows.length === 1 && rows[0].commission_status === 'READY_TO_PAY', `al liquidar, la comisión queda liberada (${rows[0]?.commission_status})`);
    s = await summary();
    ok(s.liberada === 50 && s.por_cobrar === 0, `resumen: liberada $${s.liberada}`);

    console.log('== B) orden que ya estaba pagada por abonos pero SIN comisión (como quedó antes del arreglo)');
    const B = await mkOrder('B'); orders.push(B);
    await prisma.order.update({ where: { id: B.id }, data: { labor_total: 70, parts_total: 0, total_amount: 70 } }); // costos guardados sin comisión
    r = await call('POST', '/order-payments', { order_id: B.id, amount: 70, payment_method: 'efectivo' });
    rows = await rowsOf(B.id);
    ok(rows.length === 1 && Number(rows[0].earned_amount) === 70 && rows[0].commission_status === 'READY_TO_PAY', `pagar por abonos genera y libera la comisión que faltaba (HTTP ${r.status} ${JSON.stringify(r.body.finance)}; ${rows.length} fila(s) $${rows[0]?.earned_amount} ${rows[0]?.commission_status})`);

    console.log('== C) abono parcial: sigue pendiente; al completar, se libera');
    const C = await mkOrder('C'); orders.push(C);
    await call('PUT', `/orders/${C.id}/costs`, { labor_total: 40, parts: [] });
    await call('POST', '/order-payments', { order_id: C.id, amount: 10, payment_method: 'efectivo' });
    ok((await rowsOf(C.id))[0].commission_status === 'PENDING_PAYMENT', 'con abono parcial sigue pendiente');
    await call('POST', '/order-payments', { order_id: C.id, amount: 30, payment_method: 'efectivo' });
    ok((await rowsOf(C.id))[0].commission_status === 'READY_TO_PAY', 'al completar el pago queda liberada');

    console.log('== D) editar la mano de obra actualiza la comisión pendiente, pero una ya pagada al mecánico NO se toca');
    const D = await mkOrder('D'); orders.push(D);
    await call('PUT', `/orders/${D.id}/costs`, { labor_total: 100, parts: [] });
    await call('PUT', `/orders/${D.id}/costs`, { labor_total: 120, parts: [] });
    rows = await rowsOf(D.id);
    ok(rows.length === 1 && Number(rows[0].earned_amount) === 120, `cambiar la mano de obra recalcula (${rows.length} fila, $${rows[0]?.earned_amount})`);
    await prisma.mechanicEarning.update({ where: { id: rows[0].id }, data: { commission_status: 'PAID', is_paid: true } });
    await call('PUT', `/orders/${D.id}/costs`, { labor_total: 999, parts: [] });
    rows = await rowsOf(D.id);
    ok(rows.length === 1 && Number(rows[0].earned_amount) === 120 && rows[0].commission_status === 'PAID', 'una comisión ya pagada no se modifica');

    console.log('== E) mano de obra $0 no genera comisión; el flujo antiguo (mark_as_paid) sigue funcionando');
    const E = await mkOrder('E'); orders.push(E);
    await call('PUT', `/orders/${E.id}/costs`, { labor_total: 0, parts: [{ name: 'Pieza', price: 25, quantity: 1 }] });
    ok((await rowsOf(E.id)).length === 0, 'sin mano de obra no hay comisión');
    const F = await mkOrder('F'); orders.push(F);
    await call('PUT', `/orders/${F.id}/costs`, { labor_total: 60, parts: [], mark_as_paid: true });
    rows = await rowsOf(F.id);
    ok(rows.length === 1 && Number(rows[0].earned_amount) === 60, 'mark_as_paid crea la comisión (flujo anterior)');
    s = await summary();
    ok(s.orders_count === 5, `el resumen cuenta las órdenes con comisión (${s.orders_count})`);

    console.log('== G) corrección de lo que ya quedó mal: órdenes cobradas este mes sin comisión');
    const { backfillMissingEarnings } = await import('../src/lib/commission-backfill.js');
    const cancelled = await prisma.orderStatus.findFirst({ where: { workspace_id: ws.id, name: { contains: 'cancel', mode: 'insensitive' } } });
    const now = new Date(); const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    const paidNoRows = async (n, extra = {}) => { const o = await mkOrder(n); orders.push(o); await prisma.order.update({ where: { id: o.id }, data: { labor_total: 55, parts_total: 0, total_amount: 55, is_paid: true, paid_at: now, ...extra } }); return o; };
    const G1 = await paidNoRows('G1');                                   // cobrada este mes, sin comisión -> se arregla
    const G2 = await paidNoRows('G2', { paid_at: twoMonthsAgo });        // cobrada hace 2 meses -> NO se toca
    const G3 = await paidNoRows('G3', { is_paid: false, paid_at: null }); // sin cobrar -> NO se toca
    const G4 = cancelled ? await paidNoRows('G4', { status_id: cancelled.id }) : null; // cancelada -> NO se toca
    const fixed = await backfillMissingEarnings(ws.id);
    ok(fixed >= 1, `la migración arregló ${fixed} orden(es)`);
    rows = await rowsOf(G1.id);
    ok(rows.length === 1 && Number(rows[0].earned_amount) === 55 && rows[0].commission_status === 'READY_TO_PAY', `la orden cobrada queda con su comisión liberada (${rows[0]?.commission_status} $${rows[0]?.earned_amount})`);
    ok((await rowsOf(G2.id)).length === 0, 'una orden cobrada en un mes anterior no se toca');
    ok((await rowsOf(G3.id)).length === 0, 'una orden sin cobrar no se toca');
    if (G4) ok((await rowsOf(G4.id)).length === 0, 'una orden cancelada no se toca');
    const again = await backfillMissingEarnings(ws.id);
    ok(again === 0 && (await rowsOf(G1.id)).length === 1, 'repetirla no duplica nada');
} finally {
    api.kill();
    await new Promise((x) => setTimeout(x, 300));
    await cleanup().catch((e) => console.log('limpieza:', e.message));
    await prisma.$disconnect();
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
