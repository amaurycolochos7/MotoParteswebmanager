// Formato de texto de WhatsApp en la bandeja (parser del frontend, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWa, parseInline, plainWa } from '../../frontend/src/pages/shared/waFormat.js';

const T = (v) => ({ t: 'text', v });

test('negritas, cursiva, tachado y código en línea', () => {
    assert.deepEqual(parseInline('hola *mundo* y _tú_ ~no~ `x`'), [
        T('hola '), { t: 'b', c: [T('mundo')] }, T(' y '), { t: 'i', c: [T('tú')] }, T(' '), { t: 's', c: [T('no')] }, T(' '), { t: 'code', c: [T('x')] },
    ]);
});

test('se pueden anidar: negrita con cursiva', () => {
    assert.deepEqual(parseInline('*a _b_ c*'), [{ t: 'b', c: [T('a '), { t: 'i', c: [T('b')] }, T(' c')] }]);
});

test('reglas de WhatsApp: no es formato si la marca queda pegada a un espacio o dentro de una palabra', () => {
    assert.deepEqual(parseInline('2 * 3 * 4'), [T('2 * 3 * 4')]);
    assert.deepEqual(parseInline('snake_case_name'), [T('snake_case_name')]);
    assert.deepEqual(parseInline('* no es negrita *'), [T('* no es negrita *')]);
    assert.deepEqual(parseInline('sin cerrar *hola'), [T('sin cerrar *hola')]);
    assert.deepEqual(parseInline('**'), [T('**')]);
});

test('la marca de cierre puede ir antes de un signo (: , . !)', () => {
    assert.deepEqual(parseInline('*Motivo:* algo'), [{ t: 'b', c: [T('Motivo:')] }, T(' algo')]);
    assert.deepEqual(parseInline('¡*Hola*!'), [T('¡'), { t: 'b', c: [T('Hola')] }, T('!')]);
});

test('el código en línea no interpreta lo de adentro', () => {
    assert.deepEqual(parseInline('`*a*`'), [{ t: 'code', c: [T('*a*')] }]);
});

test('viñetas, citas y líneas vacías', () => {
    const b = parseWa('- uno\n* dos\n> cita\n\ntexto');
    assert.deepEqual(b.map((x) => x.kind), ['bullet', 'bullet', 'quote', 'line', 'line']);
    assert.deepEqual(b[0].nodes, [T('uno')]);
    assert.deepEqual(b[3].nodes, []);
});

test('bloque de código de varias líneas, sin formato por dentro', () => {
    const b = parseWa('antes\n```\n*a*\nb\n```\ndespués');
    assert.deepEqual(b.map((x) => x.kind), ['line', 'pre', 'line']);
    assert.equal(b[1].text, '*a*\nb');
});

test('enlaces: se reconocen y no arrastran el signo final', () => {
    const [line] = parseWa('mira https://motopartes.cloud/orden/abc_def. gracias, www.ejemplo.com');
    const links = line.nodes.filter((n) => n.t === 'link');
    assert.deepEqual(links.map((l) => l.href), ['https://motopartes.cloud/orden/abc_def', 'https://www.ejemplo.com']);
    assert.ok(line.nodes.some((n) => n.t === 'text' && n.v.startsWith('.')));
});

test('el mensaje automático real de una orden se interpreta con sus negritas', () => {
    const msg = 'Hola, Leonardo. 👋\n\n✅ *Orden MP-26-102 · Registrada con éxito*\n\n• *Motivo de ingreso:* Servicio de afinacion\n• *Te atiende:* Elihu (WhatsApp 963 191 1772)\n\n*Próximos pasos:*';
    const b = parseWa(msg);
    const bolds = b.flatMap((x) => (x.nodes || []).filter((n) => n.t === 'b').map((n) => n.c[0].v));
    assert.deepEqual(bolds, ['Orden MP-26-102 · Registrada con éxito', 'Motivo de ingreso:', 'Te atiende:', 'Próximos pasos:']);
    assert.ok(!plainWa(msg).includes('*'));
});

test('plainWa: vista previa sin marcas y en una línea', () => {
    assert.equal(plainWa('*Hola* _mundo_\n- uno'), 'Hola mundo • uno');
    assert.equal(plainWa(''), '');
});
