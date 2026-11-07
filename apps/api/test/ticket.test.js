import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTicketDoc, buildTestDoc, toPlainText, toEscPos, toPdf80,
    fold, wrap, maskPhone, fmtMoney,
} from '../src/lib/ticket.js';
import { resolvePrintSettings, sanitizePrintSettings } from '../src/lib/print-settings.js';

const WS = { name: 'MotoPartes', timezone: 'America/Mexico_City', settings: {} };
const NOW = new Date('2026-11-06T18:40:00-06:00');

function sample(over = {}) {
    return {
        workspace: WS,
        settings: resolvePrintSettings(WS),
        now: NOW,
        order: {
            order_number: 'MP-26-099', created_at: new Date('2026-11-04T10:15:00-06:00'), completed_at: NOW,
            status: { name: 'Entregada' }, customer_complaint: 'Ruido en la cadena y no arranca bien en las mañanas; se apaga en el alto y además truena al frenar fuerte en bajada',
            labor_total: 1030, parts_total: 1115, total_amount: 2145, public_token: 'f-Y_zUoH8QSm',
            mechanic: { full_name: 'Carlos Martínez' },
            services: [{ name: 'Afinación mayor', price: 850, quantity: 1 }, { name: 'Lubricado de cadena', price: 180, quantity: 1 }],
            parts: [{ name: 'Bujía NGK CR8E', price: 95, quantity: 2 }, { name: 'Kit de arrastre 428H 40/14 reforzado', price: 780, quantity: 1 }],
        },
        client: { full_name: 'Juan Pérez López', phone: '+52 961 123 4505' },
        motorcycle: { brand: 'Italika', model: 'FT150', year: 2022, plates: '4X2-ABC' },
        payments: [
            { amount: 500, payment_method: 'efectivo', payment_date: new Date('2026-11-04T11:00:00-06:00') },
            { amount: 1645, payment_method: 'tarjeta', payment_date: NOW, receipt_number: 'REC-26-0087' },
            { amount: 999, payment_method: 'efectivo', payment_date: NOW, cancelled_at: NOW },
        ],
        ...over,
    };
}
const textOf = (input, opts) => toPlainText(buildTicketDoc(input, opts));

test('todas las líneas caben en 48 y en 32 columnas', () => {
    for (const cols of [48, 32]) {
        const input = sample({ settings: { ...resolvePrintSettings(WS), paper_cols: cols } });
        const doc = buildTicketDoc(input);
        assert.equal(doc.cols, cols);
        for (const it of doc.items.filter((i) => i.text !== undefined)) {
            assert.ok(it.text.length <= cols, `(${cols}) línea de ${it.text.length}: "${it.text}"`);
        }
    }
});

test('garantía: 15 días, solo mano de obra, refacciones y piezas eléctricas sin garantía', () => {
    const t = textOf(sample());
    assert.match(t, /GARANTIA: 15 dias naturales desde la entrega\./);
    assert.match(t, /Vence el 21\/11\/2026\. UNICAMENTE en mano de obra\./);
    assert.match(t, /Refacciones y piezas electricas\nNO tienen garantia\./);
});

test('la garantía se puede apagar o personalizar', () => {
    const off = textOf(sample({ settings: { ...resolvePrintSettings(WS), warranty_enabled: false } }));
    assert.doesNotMatch(off, /GARANTIA/);
    const custom = textOf(sample({ settings: { ...resolvePrintSettings(WS), warranty_days: 30, warranty_text: 'Garantía de {dias} días, hasta {fecha}.' } }));
    assert.match(custom, /Garantia de 30 dias, hasta 06\/12\/2026\./);
});

test('teléfono enmascarado 961xxxxx05 y nunca completo', () => {
    const t = textOf(sample());
    assert.match(t, /Tel: 961xxxxx05/);
    assert.doesNotMatch(t, /9611234505/);
    assert.equal(maskPhone('9611234505'), '961xxxxx05');
    assert.equal(maskPhone('123'), '');
    assert.equal(maskPhone(null), '');
});

test('falla reportada: máximo 2 líneas con puntos suspensivos', () => {
    const lines = textOf(sample()).split('\n');
    const i = lines.indexOf('FALLA REPORTADA:');
    assert.ok(i > 0);
    assert.ok(lines[i + 1].length > 0 && lines[i + 2].endsWith('...'), lines.slice(i, i + 4).join(' | '));
    assert.match(lines[i + 3], /^-+$/); // la tercera línea ya es la regla
});

test('sin kilometraje en el ticket', () => {
    assert.doesNotMatch(textOf(sample()), /\bkm\b|kilometr/i);
});

test('totales, pagos (ignora cancelados) y marca PAGADO', () => {
    const t = textOf(sample());
    assert.match(t, /TOTAL:\s+\$2,145\.00/);
    assert.match(t, /Pago 04\/11 \(Efectivo\)\s+\$500\.00/);
    assert.match(t, /Pago 06\/11 \(Tarjeta\)\s+\$1,645\.00/);
    assert.match(t, /Recibo REC-26-0087/);
    assert.doesNotMatch(t, /\$999\.00/);
    assert.match(t, /TOTAL PAGADO:\s+\$2,145\.00/);
    assert.match(t, /SALDO:\s+\$0\.00/);
    assert.match(t, /\*\*\* PAGADO \*\*\*/);
});

test('con saldo pendiente avisa SALDO PENDIENTE', () => {
    const t = textOf(sample({ payments: [{ amount: 500, payment_method: 'efectivo', payment_date: NOW }] }));
    assert.match(t, /SALDO:\s+\$1,645\.00/);
    assert.match(t, /\*\*\* SALDO PENDIENTE \*\*\*/);
});

test('sin acentos por defecto; con acentos conserva el español', () => {
    const plain = textOf(sample());
    assert.doesNotMatch(plain, /[^\x20-\x7e\n]/);
    assert.match(plain, /Juan Perez Lopez/);
    const acc = textOf(sample({ settings: { ...resolvePrintSettings(WS), accents: true } }));
    assert.match(acc, /Juan Pérez López/);
    assert.match(acc, /GARANTÍA/);
});

test('orden antigua sin conceptos: usa la mano de obra total', () => {
    const input = sample();
    input.order.services = []; input.order.parts = [];
    assert.match(textOf(input), /Mano de obra\s+1,030\.00/);
});

test('ESC/POS: reinicio, corte, QR con la URL y acentos en CP850', () => {
    const doc = buildTicketDoc(sample());
    const buf = toEscPos(doc);
    assert.deepEqual([...buf.subarray(0, 2)], [0x1b, 0x40]);
    assert.deepEqual([...buf.subarray(-3)], [0x1d, 0x56, 0x00]);
    assert.ok(buf.includes(Buffer.from('https://motopartes.cloud/orden/f-Y_zUoH8QSm')));
    assert.ok(buf.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]))); // imprimir QR

    const acc = toEscPos(buildTicketDoc(sample({ settings: { ...resolvePrintSettings(WS), accents: true } })), { accents: true });
    assert.ok(acc.includes(Buffer.from([0x1b, 0x74, 0x02])));  // tabla PC850
    assert.ok(acc.includes(Buffer.from([0xa4])));              // ñ
    assert.deepEqual([...toEscPos(doc, { cut: 'none' }).subarray(-1)], [0x0a]);
});

test('sin QR cuando se apaga o la orden no tiene token', () => {
    const off = buildTicketDoc(sample({ settings: { ...resolvePrintSettings(WS), show_qr: false } }));
    assert.equal(off.items.some((i) => i.qr), false);
    const input = sample(); input.order.public_token = null;
    assert.equal(buildTicketDoc(input).items.some((i) => i.qr), false);
});

test('PDF de 80 mm es un PDF válido', async () => {
    const pdf = await toPdf80(buildTicketDoc(sample(), { accents: true }));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 2000);
});

test('ticket de prueba cabe en el ancho', () => {
    for (const cols of [48, 32]) {
        const doc = buildTestDoc({ paper_cols: cols, business_name: 'Taller Ñandú' }, WS);
        doc.items.forEach((i) => assert.ok(i.text.length <= cols));
    }
});

test('utilidades: fold, wrap, dinero', () => {
    assert.equal(fold('Ñandú ¿qué? ¡sí! – “x”'), 'Nandu ?que? !si! - "x"');
    assert.deepEqual(wrap('uno dos tres', 7), ['uno dos', 'tres']);
    assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
    assert.equal(fmtMoney(1234.5), '$1,234.50');
    assert.equal(fmtMoney(0), '$0.00');
});

test('ajustes: sanitiza, acota y mezcla con defaults', () => {
    const s = sanitizePrintSettings({ warranty_days: 9999, copies: 9, paper_cols: 40, accents: 'true', business_name: '  Mi   Taller ', basura: 1 });
    assert.deepEqual(s, { warranty_days: 365, copies: 3, paper_cols: 48, accents: true, business_name: 'Mi Taller' });
    const r = resolvePrintSettings({ name: 'Taller Juárez', settings: { print: { warranty_days: 15 } } });
    assert.equal(r.business_name, 'Taller Juárez');
    assert.equal(r.warranty_days, 15);
    assert.equal(r.warranty_enabled, true);
    assert.equal(r.accents, false);
});
