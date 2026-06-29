import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalize,
    digitsOnly,
    buildClientSearchWhere,
    matchesClient,
    rankScore,
} from '../src/lib/client-search.js';

test('normalize strips accents and lowercases', () => {
    assert.equal(normalize('JOSÉ Ramírez'), 'jose ramirez');
    assert.equal(normalize('  Ándrés  '), 'andres');
    assert.equal(normalize(null), '');
});

test('digitsOnly keeps only digits', () => {
    assert.equal(digitsOnly('+52 (555) 123-4567'), '525551234567');
    assert.equal(digitsOnly(null), '');
});

test('buildClientSearchWhere returns null below min length', () => {
    assert.equal(buildClientSearchWhere('a'), null);
    assert.equal(buildClientSearchWhere(''), null);
    assert.equal(buildClientSearchWhere('  '), null);
});

test('buildClientSearchWhere matches name only when query has no digits', () => {
    const where = buildClientSearchWhere('Ana');
    assert.ok(where.OR.some((c) => c.full_name?.contains === 'Ana'));
    // No phone clause when there are no digits — avoids contains:'' match-all bug.
    assert.ok(!where.OR.some((c) => c.phone));
});

test('buildClientSearchWhere adds phone clause for numeric queries', () => {
    const where = buildClientSearchWhere('555-12');
    const phoneClause = where.OR.find((c) => c.phone);
    assert.ok(phoneClause);
    assert.equal(phoneClause.phone.contains, '55512');
});

test('matchesClient is accent-insensitive on name', () => {
    const c = { full_name: 'José Ramírez', phone: '5551234567', motorcycles: [] };
    assert.equal(matchesClient(c, 'jose'), true);
    assert.equal(matchesClient(c, 'RAMIREZ'), true);
    assert.equal(matchesClient(c, 'pedro'), false);
});

test('matchesClient matches phone digits and plates', () => {
    const c = {
        full_name: 'Ana López',
        phone: '+52 555 123 4567',
        motorcycles: [{ plates: 'ABC-123', brand: 'Italika', model: 'FT150' }],
    };
    assert.equal(matchesClient(c, '1234'), true);
    assert.equal(matchesClient(c, 'abc-123'), true);
    assert.equal(matchesClient(c, 'italika'), true);
});

test('rankScore ranks exact > prefix > contains > phone', () => {
    const exact = { full_name: 'Ana', phone: '1' };
    const prefix = { full_name: 'Ana López', phone: '1' };
    const contains = { full_name: 'Mariana', phone: '1' };
    assert.ok(rankScore(exact, 'Ana') > rankScore(prefix, 'Ana'));
    assert.ok(rankScore(prefix, 'Ana') > rankScore(contains, 'Ana'));
});
