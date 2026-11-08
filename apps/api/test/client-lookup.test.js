import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLookupWhere, isPhoneQuery, summarizeHistory } from '../src/lib/client-lookup.js';

test('isPhoneQuery distingue telefonos de nombres', () => {
    assert.equal(isPhoneQuery('9981234567'), true);
    assert.equal(isPhoneQuery('+52 998 123 4567'), true);
    assert.equal(isPhoneQuery('4567'), true);
    assert.equal(isPhoneQuery('Juan'), false);
    assert.equal(isPhoneQuery('ABC123'), false);
    assert.equal(isPhoneQuery(''), false);
});

test('buildLookupWhere: consultas cortas no buscan', () => {
    assert.equal(buildLookupWhere(''), null);
    assert.equal(buildLookupWhere('12'), null);
    assert.equal(buildLookupWhere('Ju'), null);
    assert.equal(buildLookupWhere(null), null);
});

test('buildLookupWhere: ultimos 4 digitos o telefono completo busca por telefono contiene', () => {
    assert.deepEqual(buildLookupWhere('4567'), { phone: { contains: '4567' } });
    assert.deepEqual(buildLookupWhere('998 123 4567'), { phone: { contains: '9981234567' } });
});

test('buildLookupWhere: texto busca por nombre, placas, marca y modelo, sin mezclar telefono', () => {
    const w = buildLookupWhere('ABC123');
    assert.ok(Array.isArray(w.OR));
    assert.equal(w.OR.length, 4);
    assert.ok(!JSON.stringify(w).includes('"phone"'));
});

test('summarizeHistory cuenta solo ordenes terminadas', () => {
    const s = summarizeHistory([
        { status: { is_terminal: true, name: 'Entregada' }, total_amount: '350.50', completed_at: '2026-03-01T10:00:00Z', created_at: '2026-02-28T10:00:00Z' },
        { status: { is_terminal: true, name: 'Entregada' }, total_amount: 200, completed_at: null, created_at: '2026-04-10T10:00:00Z' },
        { status: { is_terminal: false, name: 'En proceso' }, total_amount: 999, completed_at: null, created_at: '2026-05-01T10:00:00Z' },
        { status: null, total_amount: 10, created_at: '2026-05-02T10:00:00Z' },
        { status: { is_terminal: true, name: 'Cancelada' }, total_amount: 777, completed_at: '2026-06-01T10:00:00Z', created_at: '2026-06-01T10:00:00Z' },
    ]);
    assert.equal(s.services_count, 2);
    assert.equal(s.total_spent, 550.5);
    assert.equal(s.open_orders, 2);
    assert.equal(s.last_visit_at, '2026-04-10T10:00:00.000Z');
});

test('summarizeHistory sin ordenes', () => {
    assert.deepEqual(summarizeHistory([]), { services_count: 0, total_spent: 0, last_visit_at: null, open_orders: 0 });
    assert.deepEqual(summarizeHistory(undefined), { services_count: 0, total_spent: 0, last_visit_at: null, open_orders: 0 });
});
