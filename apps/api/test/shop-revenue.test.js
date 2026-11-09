// Ingresos del taller: la mano de obra es el ingreso; las refacciones y el total cobrado se cuentan aparte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paidRevenue, monthRevenue } from '../../frontend/src/utils/shopRevenue.js';

const NOW = new Date(2026, 10, 9, 15, 0, 0); // 9 nov 2026
const paid = (labor, parts, extra = {}) => ({ is_paid: true, paid_at: new Date(2026, 10, 5).toISOString(), labor_total: labor, parts_total: parts, total_amount: labor + parts, ...extra });

test('el ingreso es solo la mano de obra; las refacciones y el total salen aparte', () => {
    const r = monthRevenue([paid(50, 30), paid(200, 760)], NOW);
    assert.deepEqual(r, { labor: 250, parts: 790, total: 1040, count: 2 });
});

test('solo cuentan las órdenes PAGADAS y del mes calendario, por fecha de pago', () => {
    const r = monthRevenue([
        paid(100, 0),
        paid(500, 0, { is_paid: false }),                                        // sin pagar
        paid(700, 0, { paid_at: new Date(2026, 9, 28).toISOString() }),          // pagada en octubre
        paid(900, 0, { paid_at: new Date(2026, 11, 1).toISOString() }),          // pagada en diciembre
    ], NOW);
    assert.equal(r.labor, 100);
    assert.equal(r.count, 1);
});

test('datos incompletos no rompen nada: sin mano de obra todo es refacción; la mano de obra no pasa del total', () => {
    assert.deepEqual(monthRevenue([{ is_paid: true, paid_at: new Date(2026, 10, 2).toISOString(), total_amount: '80.00' }], NOW), { labor: 0, parts: 80, total: 80, count: 1 });
    assert.equal(monthRevenue([paid(500, 0, { total_amount: 300 })], NOW).labor, 300);
    assert.deepEqual(monthRevenue(null, NOW), { labor: 0, parts: 0, total: 0, count: 0 });
});

test('paidRevenue con rango: mes anterior', () => {
    const r = paidRevenue([paid(40, 10, { paid_at: new Date(2026, 9, 10).toISOString() }), paid(60, 0)], new Date(2026, 9, 1), new Date(2026, 10, 1));
    assert.equal(r.labor, 40);
});
