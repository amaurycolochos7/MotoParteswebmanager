import test from 'node:test';
import assert from 'node:assert/strict';
import { toLocal10, phoneVariants, digits, shortName, formatPhone } from '../src/lib/phone.js';

test('formatPhone agrupa 3-3-4 y no inventa nada si el número es inválido', () => {
    assert.equal(formatPhone('9611234567'), '961 123 4567');
    assert.equal(formatPhone('+52 961 123 4567'), '961 123 4567');
    assert.equal(formatPhone('123'), '');
    assert.equal(formatPhone(null), '');
});

test('toLocal10 acepta 10 dígitos y variantes con lada', () => {
    assert.equal(toLocal10('9611234567'), '9611234567');
    assert.equal(toLocal10('961 123 4567'), '9611234567');
    assert.equal(toLocal10('+52 961 123 4567'), '9611234567');
    assert.equal(toLocal10('529611234567'), '9611234567');
    assert.equal(toLocal10('5219611234567'), '9611234567');
});

test('toLocal10 rechaza lo que no es un teléfono de 10 dígitos', () => {
    assert.equal(toLocal10(''), null);
    assert.equal(toLocal10('12345'), null);
    assert.equal(toLocal10('96112345678'), null);
    assert.equal(toLocal10(null), null);
});

test('phoneVariants incluye el formato guardado antes en cualquiera de sus formas', () => {
    const v = phoneVariants('+52 961 123 4567');
    for (const f of ['9611234567', '529611234567', '+529611234567', '5219611234567']) assert.ok(v.includes(f), f);
});

test('digits y shortName', () => {
    assert.equal(digits('(961) 12-3'), '961123');
    assert.equal(shortName('Juan Pérez López'), 'Juan P.');
    assert.equal(shortName('Ana'), 'Ana');
    assert.equal(shortName(''), '');
});
