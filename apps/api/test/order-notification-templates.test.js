import { test } from 'node:test';
import assert from 'node:assert/strict';
import { substitute } from '../src/lib/automations.js';
import { matchesFilter } from '../src/lib/events.js';
import { DEFAULTS } from '../prisma/seed-automation-defaults.js';

const byKey = (k) => DEFAULTS.find((d) => d.key === k);

// A realistic variable bag mirroring what buildVars() produces for an order.
// NOTE: no example/fake names here — these are stand-ins for real order data.
function orderVars(overrides = {}) {
    return {
        cliente: 'Juan Pérez',
        folio: 'MP-26-100',
        marca: 'Yamaha',
        modelo: 'FZ 2.0',
        moto: 'Yamaha FZ 2.0',
        motivo: 'Cambio de aceite y frenos',
        total: '$1,300',
        taller: 'MotoPartes',
        atiende: '',
        ...overrides,
    };
}

test('el mensaje incluye quién atiende (con su WhatsApp) cuando la orden tiene mecánico', () => {
    const atiende = '\n• *Te atiende:* Elihu Hernández (WhatsApp 961 123 4567)';
    for (const key of ['confirmacion_ingreso', 'lista_recoger']) {
        const body = substitute(byKey(key).template.body, orderVars({ atiende }));
        assert.match(body, /Te atiende:\* Elihu Hernández \(WhatsApp 961 123 4567\)/, key);
        assert.ok(!/\{[a-z_]+\}/i.test(body), key);
    }
});

test('sin mecánico no queda línea vacía de más ni placeholder suelto', () => {
    for (const key of ['confirmacion_ingreso', 'lista_recoger']) {
        const body = substitute(byKey(key).template.body, orderVars());
        assert.ok(!body.includes('Te atiende'), key);
        assert.ok(!/\n\n\n/.test(body), key);
    }
});

test('MXN currency helper formats like $1,300', () => {
    // Same expression used by buildVars() for vars.total.
    assert.equal('$' + Number(1300).toLocaleString('es-MX'), '$1,300');
    assert.equal('$' + Number(0).toLocaleString('es-MX'), '$0');
});

test('Message 1 (orden registrada) is wired to order.created', () => {
    const spec = byKey('confirmacion_ingreso');
    assert.equal(spec.automation.trigger, 'order.created');
    assert.equal(spec.automation.action, 'whatsapp.send_template');
    assert.equal(spec.automation.params.to, 'client');
});

test('Message 2 (servicio concluido) fires only on status Lista', () => {
    const spec = byKey('lista_recoger');
    assert.equal(spec.automation.trigger, 'order.status_changed');
    assert.deepEqual(spec.automation.filter, { status_name: 'Lista' });
    // Only 'Lista' passes the filter; intermediate states do not.
    assert.equal(matchesFilter(spec.automation.filter, { status_name: 'Lista' }), true);
    for (const st of ['Diagnóstico', 'Cotización', 'En proceso', 'Recibida', 'Entregada']) {
        assert.equal(
            matchesFilter(spec.automation.filter, { status_name: st }),
            false,
            `must NOT fire on ${st}`,
        );
    }
});

test('Both order notifications are idempotent per order (dedup_per_order)', () => {
    assert.equal(byKey('confirmacion_ingreso').automation.params.dedup_per_order, true);
    assert.equal(byKey('lista_recoger').automation.params.dedup_per_order, true);
});

test('Message 1 renders with real data and leaves no placeholders', () => {
    const body = substitute(byKey('confirmacion_ingreso').template.body, orderVars());
    assert.ok(!/\{[a-z_]+\}/i.test(body), 'no leftover {placeholder}');
    assert.match(body, /Hola, Juan Pérez/);
    assert.match(body, /Orden MP-26-100 · Registrada con éxito/);
    assert.match(body, /recibimos tu \*Yamaha FZ 2\.0\*/);
    assert.match(body, /Motivo de ingreso:\* Cambio de aceite y frenos/);
    // WhatsApp formatting: single-asterisk bold + bullet, no HTML.
    assert.ok(body.includes('•'));
    assert.ok(!/<[a-z]/i.test(body), 'no HTML tags');
});

test('Message 2 renders with real data and leaves no placeholders', () => {
    const body = substitute(byKey('lista_recoger').template.body, orderVars());
    assert.ok(!/\{[a-z_]+\}/i.test(body), 'no leftover {placeholder}');
    assert.match(body, /^\*Juan Pérez\*,/);
    assert.match(body, /servicio de tu \*Yamaha FZ 2\.0\* ha concluido/);
    assert.match(body, /Orden de servicio:\* MP-26-100/);
    assert.match(body, /Total a liquidar:\* \$1,300/);
    assert.match(body, /Lunes a Viernes: 9:00 a 18:00 hrs\./);
    assert.match(body, /Sábados: 9:00 a 14:00 hrs\./);
});

test('Missing optional data falls back safely (no empty gaps)', () => {
    // Simulate an order created without complaint and without motorcycle.
    const vars = orderVars({ motivo: 'Servicio general', moto: 'motocicleta' });
    const body1 = substitute(byKey('confirmacion_ingreso').template.body, vars);
    assert.match(body1, /Motivo de ingreso:\* Servicio general/);
    assert.match(body1, /recibimos tu \*motocicleta\*/);
    assert.ok(!/\{[a-z_]+\}/i.test(body1));
});

test('No example/fake names leak into the stored template bodies', () => {
    const forbidden = ['Carlos', 'Gloria', 'Veloci 200', 'Dazon', 'Zmax', 'MP-26-084', 'MP-26-085'];
    for (const key of ['confirmacion_ingreso', 'lista_recoger']) {
        const body = byKey(key).template.body;
        for (const f of forbidden) {
            assert.ok(!body.includes(f), `template ${key} must not contain example "${f}"`);
        }
    }
});

// ── Lenguaje neutral: los avisos a clientes no deben asumir el género de nadie ni tratar de "usted" ──
import { isReplaceableBody } from '../src/lib/default-messages.js';
import { LEGACY_BODIES } from '../src/lib/legacy-template-bodies.js';

const CUSTOMER_KEYS = ['confirmacion_ingreso', 'cotizacion_lista', 'lista_recoger', 'estado_en_revision', 'estado_autorizada',
    'estado_en_proceso', 'estado_esperando_refacciones', 'estado_entregada', 'estado_cancelada',
    'recordatorio_cita_24h', 'feedback_post_servicio', 'aniversario_cliente', 'cita_confirmada', 'cita_rechazada'];
// Palabras que marcan género o trato formal: "Estimada/o", "Querido/a", "Bienvenido/a", "señor/a", "usted" y sus formas (su, sus, le, lo, mantenerlo...)
const FORMAL_OR_GENDERED = /\b(estimad[oa]s?|querid[oa]s?|bienvenid[oa]s?|se[ñn]or(a|es|as)?|sr\.?|sra\.?|usted(es)?|su|sus|le|les|informad[oa]|notificad[oa]|atendid[oa])\b|mantenerl[oa]/i;

test('ningún aviso a clientes asume género ni trata de usted', () => {
    for (const key of CUSTOMER_KEYS) {
        const body = byKey(key).template.body.replace(/\{[a-z_]+\}/g, 'X');
        const hit = body.match(FORMAL_OR_GENDERED);
        assert.equal(hit, null, `${key}: "${hit && hit[0]}"`);
    }
});

test('el aviso de "lista para recoger" queda como se pidió: nombre, "te informamos", "tu"', () => {
    const body = substitute(byKey('lista_recoger').template.body, orderVars({ cliente: 'Edgar Gordillo', moto: 'Italika Atv 200' }));
    assert.match(body, /^\*Edgar Gordillo\*,\n\nTe informamos que el servicio de tu \*Italika Atv 200\*/);
    assert.match(body, /ya se encuentra listo para ser entregado/);
    assert.ok(!/estimad/i.test(body));
});

test('migración: solo se reemplaza una plantilla que sigue con un texto anterior por defecto', () => {
    for (const [key, old] of Object.entries(LEGACY_BODIES)) {
        const spec = byKey(key);
        assert.equal(isReplaceableBody(old, spec), true, `${key}: el texto formal anterior se actualiza`);
        assert.equal(isReplaceableBody(old.replace('{atiende}', ''), spec), true, `${key}: también sin {atiende}`);
        assert.equal(isReplaceableBody(spec.template.body, spec), false, `${key}: el nuevo no se vuelve a escribir`);
        assert.equal(isReplaceableBody(old + '\nGracias, vuelva pronto.', spec), false, `${key}: un texto que alguien editó NO se pisa`);
    }
    assert.ok(Object.keys(LEGACY_BODIES).length >= 8);
});
