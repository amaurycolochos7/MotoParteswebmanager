// Página de prueba en ESC/POS (ASCII puro: funciona en cualquier impresora de tickets)
const ESC = 0x1b;
const GS = 0x1d;

export function buildTestPage({ cols = 48, now = new Date(), printer = '' } = {}) {
    const parts = [];
    const bytes = (...b) => parts.push(Buffer.from(b));
    const text = (s) => parts.push(Buffer.from(s + '\n', 'latin1'));
    const rule = (c = '-') => text(c.repeat(cols));
    const center = (s) => text(s.length >= cols ? s : ' '.repeat(Math.floor((cols - s.length) / 2)) + s);

    bytes(ESC, 0x40); // ESC @  → reinicia la impresora
    rule('=');
    bytes(ESC, 0x45, 1); // negritas
    center('MOTOPARTES');
    bytes(ESC, 0x45, 0);
    center('Agente de impresion');
    rule('=');
    center('PAGINA DE PRUEBA');
    rule('-');
    text('Fecha: ' + now.toLocaleString('es-MX'));
    if (printer) text('Impresora: ' + String(printer).slice(0, cols - 11));
    rule('-');
    text('1234567890'.repeat(Math.ceil(cols / 10)).slice(0, cols));
    rule('-');
    center('Si puedes leer esto,');
    center('la impresora quedo bien conectada.');
    rule('=');
    bytes(ESC, 0x64, 5); // ESC d 5 → avanza 5 líneas
    bytes(GS, 0x56, 0x00); // GS V 0  → corte
    return Buffer.concat(parts);
}
