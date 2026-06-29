import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeOrderFinance,
    validateNewPayment,
    computeCommission,
    nextCommissionStatus,
    normalizePaymentMethod,
    money,
} from '../src/lib/payments.js';

test('computeOrderFinance: no payments -> Pendiente, full balance', () => {
    const f = computeOrderFinance({ total_amount: 1000 }, []);
    assert.equal(f.total, 1000);
    assert.equal(f.paid, 0);
    assert.equal(f.balance, 1000);
    assert.equal(f.payment_status, 'Pendiente');
    assert.equal(f.is_fully_paid, false);
});

test('computeOrderFinance: partial -> Parcial', () => {
    const f = computeOrderFinance({ total_amount: 1000 }, [{ amount: 400 }]);
    assert.equal(f.paid, 400);
    assert.equal(f.balance, 600);
    assert.equal(f.payment_status, 'Parcial');
});

test('computeOrderFinance: liquidated -> Pagada and fully paid', () => {
    const f = computeOrderFinance({ total_amount: 1000 }, [{ amount: 400 }, { amount: 600 }]);
    assert.equal(f.paid, 1000);
    assert.equal(f.balance, 0);
    assert.equal(f.payment_status, 'Pagada');
    assert.equal(f.is_fully_paid, true);
});

test('computeOrderFinance: ignores cancelled payments', () => {
    const f = computeOrderFinance({ total_amount: 1000 }, [
        { amount: 1000, cancelled_at: new Date() },
        { amount: 300 },
    ]);
    assert.equal(f.paid, 300);
    assert.equal(f.balance, 700);
});

test('computeOrderFinance: overpay reported, balance floored at 0', () => {
    const f = computeOrderFinance({ total_amount: 1000 }, [{ amount: 1200 }]);
    assert.equal(f.balance, 0);
    assert.equal(f.overpaid, 200);
    assert.equal(f.is_fully_paid, true);
});

test('validateNewPayment blocks zero, negative, NaN', () => {
    assert.equal(validateNewPayment(0, 1000).ok, false);
    assert.equal(validateNewPayment(-50, 1000).ok, false);
    assert.equal(validateNewPayment('abc', 1000).ok, false);
});

test('validateNewPayment blocks overpay by default, allows when flagged', () => {
    assert.equal(validateNewPayment(1500, 1000).ok, false);
    assert.equal(validateNewPayment(1500, 1000, { allowOverpay: true }).ok, true);
    assert.equal(validateNewPayment(1000, 1000).ok, true);
});

test('computeCommission is over labor only, variable rate', () => {
    assert.deepEqual(computeCommission(500, 30), { base: 500, rate: 30, amount: 150 });
    assert.deepEqual(computeCommission(800, 12.5), { base: 800, rate: 12.5, amount: 100 });
});

test('nextCommissionStatus: not released until fully paid', () => {
    const partial = computeOrderFinance({ total_amount: 1000 }, [{ amount: 400 }]);
    assert.equal(nextCommissionStatus('PENDING_PAYMENT', partial), 'PENDING_PAYMENT');

    const full = computeOrderFinance({ total_amount: 1000 }, [{ amount: 1000 }]);
    assert.equal(nextCommissionStatus('PENDING_PAYMENT', full), 'READY_TO_PAY');
});

test('nextCommissionStatus: PAID/CANCELLED are terminal; cancel order cancels', () => {
    const full = computeOrderFinance({ total_amount: 1000 }, [{ amount: 1000 }]);
    assert.equal(nextCommissionStatus('PAID', full), 'PAID');
    assert.equal(nextCommissionStatus('CANCELLED', full), 'CANCELLED');
    assert.equal(nextCommissionStatus('PENDING_PAYMENT', full, { orderCancelled: true }), 'CANCELLED');
});

test('normalizePaymentMethod falls back to otro', () => {
    assert.equal(normalizePaymentMethod('Efectivo'), 'efectivo');
    assert.equal(normalizePaymentMethod('PayPal'), 'otro');
});

test('money rounds float dust', () => {
    assert.equal(money(0.1 + 0.2), 0.3);
});
