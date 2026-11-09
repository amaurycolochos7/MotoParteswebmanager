import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../prisma/seed-automation-defaults.js';
import { substitute, } from '../src/lib/automations.js';
import { matchesFilter } from '../src/lib/events.js';
import { statusKeyOf, normalizeName, ORDER_MESSAGE_KEYS, isUntouched, withoutAtiende } from '../src/lib/default-messages.js';

test('statusKeyOf: cada taller nombra distinto, la clave es la misma', () => {
    const cases = {
        'Recibida': 'recibida', 'Registrada': 'recibida',
        'Diagnóstico': 'en_revision', 'En Revisión': 'en_revision', 'EN REVISION': 'en_revision',
        'Cotización': 'cotizacion', 'Cotizacion enviada': 'cotizacion',
        'Autorizada': 'autorizada',
        'En proceso': 'en_proceso', 'En Reparación': 'en_proceso', 'En Reparacion': 'en_proceso',
        'Esperando refacción': 'esperando_refacciones', 'Esperando Refacciones': 'esperando_refacciones',
        'Lista': 'lista', 'Lista para Entregar': 'lista', 'lista para recoger': 'lista',
        'Entregada': 'entregada', 'Entregado': 'entregada',
        'Cancelada': 'cancelada',
        'Garantía': 'garantia',
        'Esperando autorización del cliente': 'esperando_autorizacion_del_cliente',
    };
    for (const [name, key] of Object.entries(cases)) assert.equal(statusKeyOf(name), key, name);
    assert.equal(statusKeyOf(''), null);
    assert.equal(statusKeyOf(null), null);
    assert.equal(normalizeName('  Ñandú  Ágil!! '), 'nandu agil');
});

test('hay un mensaje por cada estado que antes avisaba la pantalla', () => {
    const keys = DEFAULTS.map((d) => d.key);
    for (const k of ORDER_MESSAGE_KEYS) assert.ok(keys.includes(k), `falta ${k} en el seed`);
    const statusKeys = DEFAULTS.filter((d) => d.key.startsWith('estado_')).map((d) => d.automation.filter.status_key);
    for (const s of ['en_revision', 'autorizada', 'en_proceso', 'esperando_refacciones', 'entregada', 'cancelada']) {
        assert.ok(statusKeys.includes(s), `falta automatización para ${s}`);
    }
});

test('una automatización por estado: nunca dos distintas responden al mismo estado (sin mensajes dobles)', () => {
    // Por cada estado del taller exactamente UNA automatización de las de orden debe coincidir con el evento.
    const order = DEFAULTS.filter((d) => ORDER_MESSAGE_KEYS.includes(d.key) && d.automation.trigger === 'order.status_changed');
    for (const name of ['Recibida', 'Diagnóstico', 'Cotización', 'En proceso', 'En Reparación', 'Lista', 'Lista para Entregar',
        'Entregada', 'Cancelada', 'Esperando refacciones', 'Autorizada', 'En Revisión']) {
        const ctx = { status_name: name, status_key: statusKeyOf(name) };
        const hits = order.filter((d) => matchesFilter(d.automation.filter || {}, ctx));
        // 'Cotización' y 'Lista' siguen filtrando por nombre/clave heredados: igual debe ser a lo sumo 1.
        assert.ok(hits.length <= 1, `${name}: ${hits.map((h) => h.key).join(', ')}`);
    }
});

test('todas las plantillas de estado usan solo variables que existen y {atiende}', () => {
    const known = new Set(['cliente', 'folio', 'moto', 'taller', 'atiende', 'motivo', 'total', 'anticipo', 'marca', 'modelo']);
    for (const d of DEFAULTS.filter((x) => x.key.startsWith('estado_'))) {
        const vars = [...d.template.body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
        for (const v of vars) assert.ok(known.has(v), `${d.key} usa {${v}}`);
        assert.equal(d.automation.params.dedup_per_order, true, `${d.key} sin deduplicación por orden`);
        assert.equal(d.automation.params.to, 'client');
        assert.equal(d.automation.action, 'whatsapp.send_template');
    }
});

test('con la plantilla de estado y sin mecánico no queda línea rota', () => {
    const d = DEFAULTS.find((x) => x.key === 'estado_en_proceso');
    const base = { cliente: 'Juan', folio: 'MP-1', moto: 'Italika FT150', taller: 'MotoPartes', atiende: '' };
    const sin = substitute(d.template.body, base);
    assert.ok(!/\{[a-z_]+\}/.test(sin));
    assert.ok(!sin.includes('\n\n\n'));
    const con = substitute(d.template.body, { ...base, atiende: '\n• *Te atiende:* Elihu (WhatsApp 961 123 4567)' });
    assert.match(con, /Te atiende:\* Elihu/);
});

test('isUntouched: solo filas que nadie editó', () => {
    const t = new Date('2026-11-08T10:00:00Z');
    assert.equal(isUntouched({ created_at: t, updated_at: t }), true);
    assert.equal(isUntouched({ created_at: t, updated_at: new Date(t.getTime() + 3000) }), true);
    assert.equal(isUntouched({ created_at: t, updated_at: new Date(t.getTime() + 60_000) }), false);
});

test('withoutAtiende reconstruye el texto anterior por defecto (para mejorarlo sin pisar ediciones)', () => {
    const d = DEFAULTS.find((x) => x.key === 'confirmacion_ingreso');
    assert.ok(d.template.body.includes('{atiende}'));
    assert.ok(!withoutAtiende(d.template.body).includes('{atiende}'));
    assert.notEqual(withoutAtiende(d.template.body), d.template.body);
});

// ── Reconciliación de automatizaciones (caso real de producción) ───────────
import { planAutomationFixes } from '../src/lib/default-messages.js';

const OLD = '2026-04-19T00:00:00Z';
const NEW = '2026-11-08T00:00:00Z';
const mk = (id, name, trigger, enabled, filter, dedup, updated_at, is_default = true) => (
    { id, name, trigger, enabled, filter, is_default, params: dedup ? { dedup_per_order: true } : {}, updated_at }
);
const STATUSES = ['Registrada', 'En Revisión', 'Autorizada', 'En Reparación', 'Lista para Entregar', 'Entregada', 'Cancelada'];

test('apaga la automatización vieja duplicada y conserva la que tiene dedup', () => {
    const plan = planAutomationFixes([
        mk('legacy', 'Confirmación de ingreso', 'order.created', true, {}, false, OLD),
        mk('formal', 'Confirmación de ingreso', 'order.created', true, {}, true, NEW),
    ], STATUSES);
    assert.deepEqual(plan.disable, ['legacy']);
});

test('corrige el filtro "Lista" cuando el estado real se llama "Lista para Entregar"', () => {
    const plan = planAutomationFixes([mk('l', 'Lista para recoger', 'order.status_changed', true, { status_name: 'Lista' }, true, NEW)], STATUSES);
    assert.deepEqual(plan.fixFilter, [{ id: 'l', filter: { status_key: 'lista' } }]);
});

test('no toca un filtro que sí coincide con un estado real ni automatizaciones que no son por defecto', () => {
    const plan = planAutomationFixes([
        mk('a', 'Entrega', 'order.status_changed', true, { status_name: 'Entregada' }, true, NEW),
        mk('b', 'Mía', 'order.created', true, {}, false, OLD, false),
        mk('c', 'Mía', 'order.created', true, {}, false, NEW, false),
    ], STATUSES);
    assert.deepEqual(plan, { disable: [], fixFilter: [] });
});

test('no apaga automatizaciones distintas (otro nombre o filtro) ni las que ya están apagadas', () => {
    const plan = planAutomationFixes([
        mk('x', 'Estado: autorizada', 'order.status_changed', true, { status_key: 'autorizada' }, true, NEW),
        mk('y', 'Estado: cancelada', 'order.status_changed', true, { status_key: 'cancelada' }, true, NEW),
        mk('z', 'Estado: autorizada', 'order.status_changed', false, { status_key: 'autorizada' }, false, OLD),
    ], STATUSES);
    assert.deepEqual(plan.disable, []);
});

test('es idempotente: aplicar el plan y volver a planear no da nada', () => {
    const A = [
        mk('legacy', 'Confirmación de ingreso', 'order.created', true, {}, false, OLD),
        mk('formal', 'Confirmación de ingreso', 'order.created', true, {}, true, NEW),
        mk('l', 'Lista para recoger', 'order.status_changed', true, { status_name: 'Lista' }, true, NEW),
    ];
    const p1 = planAutomationFixes(A, STATUSES);
    for (const a of A) {
        if (p1.disable.includes(a.id)) a.enabled = false;
        const f = p1.fixFilter.find((x) => x.id === a.id); if (f) a.filter = f.filter;
    }
    assert.deepEqual(planAutomationFixes(A, STATUSES), { disable: [], fixFilter: [] });
});
