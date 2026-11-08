import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeEarningsRows, weekStartMonday, summarizeEarnings, effectiveCommissionStatus, periodRange,
} from '../src/lib/commissions.js';

const near = (a, b, eps = 0.0001) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('mecánico normal: gana labor * su porcentaje', () => {
    const rows = computeEarningsRows({
        labor: 1000,
        mechanic: { id: 'm1', commission_percentage: 40, requires_approval: false, supervised_by: null },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mechanic_id, 'm1');
    assert.equal(rows[0].commission_rate, 40);
    assert.equal(rows[0].earned_amount, 400);
});

test('auxiliar CON supervisor: el auxiliar gana su % y el resto es del maestro', () => {
    const rows = computeEarningsRows({
        labor: 1000,
        mechanic: { id: 'aux', commission_percentage: 30, requires_approval: true, supervised_by: 'mas' },
        supervisor: { id: 'mas', commission_percentage: 50 },
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].mechanic_id, 'aux');
    assert.equal(rows[0].earned_amount, 300);
    assert.equal(rows[1].mechanic_id, 'mas');
    assert.equal(rows[1].earned_amount, 700);          // labor - lo del auxiliar (comportamiento previo)
    near(rows[0].earned_amount + rows[1].earned_amount, 1000);
});

test('auxiliar con supervisor: si la suma de porcentajes pasa de 100 se escalan', () => {
    const rows = computeEarningsRows({
        labor: 1000,
        mechanic: { id: 'aux', commission_percentage: 60, requires_approval: true, supervised_by: 'mas' },
        supervisor: { id: 'mas', commission_percentage: 80 },
    });
    near(rows[0].commission_rate, 60 * (100 / 140));
    near(rows[1].commission_rate, 80 * (100 / 140));
    near(rows[0].earned_amount, 1000 * (60 * (100 / 140)) / 100);
    near(rows[0].earned_amount + rows[1].earned_amount, 1000);
});

test('auxiliar con supervisor sin % propio del maestro: el maestro recibe 100 - auxiliar', () => {
    const rows = computeEarningsRows({
        labor: 500,
        mechanic: { id: 'aux', commission_percentage: 25, requires_approval: true, supervised_by: 'mas' },
        supervisor: { id: 'mas', commission_percentage: null },
    });
    assert.equal(rows[0].earned_amount, 125);
    assert.equal(rows[1].commission_rate, 75);
    assert.equal(rows[1].earned_amount, 375);
});

test('auxiliar SIN supervisor: cae al caso normal (una sola fila)', () => {
    const rows = computeEarningsRows({
        labor: 200,
        mechanic: { id: 'aux', commission_percentage: 50, requires_approval: true, supervised_by: null },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].earned_amount, 100);
});

test('auxiliar con supervisor que ya no existe: solo la fila del auxiliar', () => {
    const rows = computeEarningsRows({
        labor: 200,
        mechanic: { id: 'aux', commission_percentage: 50, requires_approval: true, supervised_by: 'gone' },
        supervisor: null,
    });
    assert.equal(rows.length, 1);
});

test('sin mano de obra o sin mecánico no hay comisión', () => {
    assert.deepEqual(computeEarningsRows({ labor: 0, mechanic: { id: 'x', commission_percentage: 10 } }), []);
    assert.deepEqual(computeEarningsRows({ labor: 100, mechanic: null }), []);
    assert.deepEqual(computeEarningsRows({ labor: '', mechanic: { id: 'x', commission_percentage: 10 } }), []);
});

test('acepta números como texto o Decimal (toString)', () => {
    const dec = { toString: () => '250.50' };
    const rows = computeEarningsRows({ labor: dec, mechanic: { id: 'm', commission_percentage: '10' } });
    near(rows[0].earned_amount, 25.05);
});

test('weekStartMonday: lunes 00:00 (domingo cuenta para la semana anterior)', () => {
    const sunday = new Date(2026, 10, 8, 15, 0, 0);   // 8-nov-2026 es domingo
    const start = weekStartMonday(sunday);
    assert.equal(start.getDay(), 1);
    assert.equal(start.getDate(), 2);
    assert.equal(start.getHours(), 0);
    const wed = new Date(2026, 10, 11, 9, 0, 0);
    assert.equal(weekStartMonday(wed).getDate(), 9);
});

test('effectiveCommissionStatus respeta is_paid heredado y cancelaciones', () => {
    assert.equal(effectiveCommissionStatus({ commission_status: 'PENDING_PAYMENT', is_paid: false }), 'PENDING_PAYMENT');
    assert.equal(effectiveCommissionStatus({ commission_status: 'PENDING_PAYMENT', is_paid: true }), 'PAID');
    assert.equal(effectiveCommissionStatus({ commission_status: 'READY_TO_PAY', is_paid: false }), 'READY_TO_PAY');
    assert.equal(effectiveCommissionStatus({ commission_status: 'CANCELLED', is_paid: true }), 'CANCELLED');
    assert.equal(effectiveCommissionStatus({}), 'PENDING_PAYMENT');
});

test('summarizeEarnings separa por cobrar / liberada / pagada y no cuenta canceladas', () => {
    const s = summarizeEarnings([
        { order_id: 'a', earned_amount: 100, labor_amount: 1000, commission_status: 'PENDING_PAYMENT', is_paid: false },
        { order_id: 'b', earned_amount: '50.555', labor_amount: 500, commission_status: 'READY_TO_PAY', is_paid: false },
        { order_id: 'c', earned_amount: 70, labor_amount: 700, commission_status: 'PAID', is_paid: true },
        { order_id: 'd', earned_amount: 999, labor_amount: 999, commission_status: 'CANCELLED', is_paid: false },
        { order_id: 'a', earned_amount: 10, labor_amount: 100, commission_status: 'PENDING_PAYMENT', is_paid: false },
    ]);
    assert.equal(s.por_cobrar, 110);
    assert.equal(s.liberada, 50.56);
    assert.equal(s.pagada, 70);
    assert.equal(s.total_comision, 230.56);
    assert.equal(s.orders_count, 3);
    assert.equal(s.labor_total, 2300);
});

test('summarizeEarnings sin filas devuelve ceros', () => {
    assert.deepEqual(summarizeEarnings([]), { orders_count: 0, por_cobrar: 0, liberada: 0, pagada: 0, total_comision: 0, labor_total: 0 });
});

test('periodRange: semana, mes y todo', () => {
    const now = new Date(2026, 10, 11, 12, 0, 0);
    assert.equal(periodRange('week', now).start.getDate(), 9);
    const m = periodRange('month', now).start;
    assert.equal(m.getDate(), 1);
    assert.equal(m.getMonth(), 10);
    assert.equal(periodRange('all', now).start, null);
    assert.equal(periodRange('loquesea', now).start.getDate(), 9);
});
