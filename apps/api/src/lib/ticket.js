// Ticket de cierre de orden: arma UN documento y lo renderiza a
//   - texto plano  (vista previa en pantalla)
//   - ESC/POS      (impresora térmica por el agente de Windows)
//   - PDF de 80 mm (envío por WhatsApp)
//
// Todo es puro (sin base de datos ni red) para poder probarlo. La ruta
// (routes/print.js) carga los datos y llama a buildTicketDoc().
//
// Documento: { cols, items } con items:
//   { text, bold? }          línea ya maquetada (largo <= cols)
//   { qr: 'https://…' }      código QR centrado
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { toNum, money } from './payments.js';

// ───────────────────────── utilidades de texto ─────────────────────────

// CP850 (la tabla "ESC t 2" de casi todas las térmicas) para el español.
const CP850 = {
    'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5,
    '¿': 0xA8, '¡': 0xAD, 'ü': 0x81, 'Ü': 0x9A, 'Á': 0xB5, 'É': 0x90, 'Í': 0xD6,
    'Ó': 0xE0, 'Ú': 0xE9,
};

/** Quita acentos y todo lo que no sea ASCII imprimible (1:1 en largo para letras). */
export function fold(s) {
    return String(s ?? '')
        .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
        .replace(/¿/g, '?').replace(/¡/g, '!')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[–—]/g, '-').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
        .replace(/[^\x20-\x7e\n]/g, '');
}

/** Deja los acentos del español y quita lo demás (para impresoras con CP850). */
export function keepSpanish(s) {
    return String(s ?? '')
        .replace(/[–—]/g, '-').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
        .split('').map((ch) => (ch === '\n' || (ch >= ' ' && ch <= '~') || CP850[ch] !== undefined ? ch : '')).join('');
}

/** Corta en líneas de ancho `w` respetando palabras; palabras muy largas se parten. */
export function wrap(text, w) {
    const out = [];
    for (const para of String(text ?? '').split('\n')) {
        let line = '';
        for (let word of para.split(/\s+/).filter(Boolean)) {
            while (word.length > w) {
                if (line) { out.push(line); line = ''; }
                out.push(word.slice(0, w));
                word = word.slice(w);
            }
            if (!line) line = word;
            else if (line.length + 1 + word.length <= w) line += ' ' + word;
            else { out.push(line); line = word; }
        }
        if (line) out.push(line);
    }
    return out;
}

const center = (s, w) => {
    const t = s.length > w ? s.slice(0, w) : s;
    return ' '.repeat(Math.floor((w - t.length) / 2)) + t;
};
const lr = (l, r, w) => {
    const space = w - l.length - r.length;
    if (space >= 1) return l + ' '.repeat(space) + r;
    return (l.slice(0, Math.max(0, w - r.length - 1)) + ' ' + r).slice(0, w);
};

/** $1,234.50 — sin Intl para que no dependa del ICU del servidor. */
export function fmtMoney(n) {
    const v = money(n);
    const [int, dec] = Math.abs(v).toFixed(2).split('.');
    return `${v < 0 ? '-' : ''}$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}
const fmtNum = (n) => fmtMoney(n).slice(1); // sin el signo $ (columnas de la tabla)

/** 961xxxxx05: primeros 3 + x + últimos 2 (sobre los últimos 10 dígitos). */
export function maskPhone(phone) {
    const d = String(phone ?? '').replace(/\D/g, '').slice(-10);
    if (d.length < 7) return '';
    return d.slice(0, 3) + 'x'.repeat(d.length - 5) + d.slice(-2);
}

function fmtDateTime(date, tz, withTime = true) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const opts = { timeZone: tz || 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric' };
    if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', opts).formatToParts(d).map((p) => [p.type, p.value]));
    const date_ = `${parts.day}/${parts.month}/${parts.year}`;
    return withTime ? `${date_} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` : date_;
}
const fmtShort = (date, tz) => fmtDateTime(date, tz, false).slice(0, 5); // dd/mm

const METHODS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro' };

export const DEFAULT_WARRANTY_TEXT =
    'GARANTÍA: {dias} días naturales desde la entrega.\n' +
    'Vence el {fecha}. ÚNICAMENTE en mano de obra.\n' +
    'Refacciones y piezas eléctricas\nNO tienen garantía.';

export function publicOrderUrl(token, base = process.env.PUBLIC_APP_URL || 'https://motopartes.cloud') {
    return `${String(base).replace(/\/+$/, '')}/orden/${token}`;
}

// ───────────────────────── armado del documento ─────────────────────────

/**
 * @param {object} input
 *   workspace {name, timezone}, settings (ya resuelto con resolvePrintSettings),
 *   order {order_number, created_at, completed_at, status:{name}, customer_complaint,
 *          labor_total, parts_total, total_amount, public_token, services[], parts[], mechanic?:{full_name}},
 *   client {full_name, phone}, motorcycle {brand, model, year, plates}, payments[], now?:Date
 * @param {object} opts { accents?: boolean }  (sobrescribe settings.accents)
 */
export function buildTicketDoc(input, opts = {}) {
    const { workspace = {}, settings = {}, order = {}, client = {}, motorcycle = {}, payments = [] } = input;
    const now = input.now || new Date();
    const cols = settings.paper_cols === 32 ? 32 : 48;
    const accents = opts.accents ?? settings.accents ?? false;
    const tz = workspace.timezone || 'America/Mexico_City';
    const T = (s) => (accents ? keepSpanish(s) : fold(s)); // todo texto pasa por aquí

    const items = [];
    const push = (text, bold = false) => items.push({ text, bold });
    const rule = (ch = '-') => push(ch.repeat(cols));
    const pushWrapped = (text, bold = false, maxLines = Infinity) => {
        const lines = wrap(T(text), cols);
        lines.slice(0, maxLines).forEach((l, i, arr) => {
            const isLast = i === arr.length - 1 && lines.length > maxLines;
            push(isLast ? (l.length > cols - 3 ? l.slice(0, cols - 3) : l) + '...' : l, bold);
        });
    };
    const pushCentered = (text, bold = false) => wrap(T(text), cols).forEach((l) => push(center(l, cols), bold));

    // Encabezado
    rule('=');
    pushCentered(T(settings.business_name || workspace.name || 'TALLER').toUpperCase(), true);
    if (settings.tagline) pushCentered(settings.tagline);
    if (settings.address) wrap(T(settings.address), cols).slice(0, 2).forEach((l) => push(center(l, cols)));
    if (settings.phone) pushCentered(`Tel. ${settings.phone}`);
    rule('=');

    // Orden
    pushCentered('ORDEN DE SERVICIO', true);
    pushCentered(order.order_number || 'S/N', true);
    const statusName = T(order.status?.name || '').toUpperCase();
    if (statusName) pushCentered(`** ${statusName} **`);
    rule();
    push(lr('Ingreso:', fmtDateTime(order.created_at, tz), cols));
    if (order.completed_at) push(lr('Entrega:', fmtDateTime(order.completed_at, tz), cols));
    if (settings.show_mechanic && order.mechanic?.full_name) {
        push(lr('Atendio:', T(order.mechanic.full_name).slice(0, cols - 9), cols));
    }
    rule();

    // Cliente y moto
    pushWrapped(`CLIENTE: ${client.full_name || 'Sin nombre'}`, false, 2);
    const masked = maskPhone(client.phone);
    if (masked) push(`Tel: ${masked}`);
    const moto = [motorcycle.brand, motorcycle.model, motorcycle.year].filter(Boolean).join(' ');
    if (moto) pushWrapped(`MOTO: ${moto}`, false, 2);
    if (motorcycle.plates) push(`Placas: ${T(motorcycle.plates)}`);
    rule();

    // Falla reportada (máx. 2 líneas)
    if (order.customer_complaint && String(order.customer_complaint).trim()) {
        push('FALLA REPORTADA:', true);
        pushWrapped(String(order.customer_complaint), false, 2);
        rule();
    }

    // Conceptos
    const services = order.services || [];
    const parts = order.parts || [];
    const labor = toNum(order.labor_total);
    const partsTotal = toNum(order.parts_total);
    const total = toNum(order.total_amount) || labor + partsTotal;
    const wide = cols >= 42;
    const dw = cols - 25; // ancho de la descripción en la tabla ancha (cant 4 + 3 espacios + P.U. 8 + importe 10)

    const pushItem = (qty, name, unit, amount) => {
        const desc = wrap(T(name), wide ? dw : cols - 2);
        if (wide) {
            const first = desc.shift() || '';
            push(`${String(qty).padEnd(4)} ${first.padEnd(dw)} ${fmtNum(unit).padStart(8)} ${fmtNum(amount).padStart(10)}`);
            desc.forEach((l) => push(`     ${l}`));
        } else {
            desc.forEach((l) => push(l));
            push(lr(`  ${qty} x ${fmtNum(unit)}`, fmtNum(amount), cols));
        }
    };
    if (services.length || parts.length || labor > 0) {
        if (wide) push(`${'CANT'} ${'DESCRIPCION'.padEnd(dw)} ${'P.U.'.padStart(8)} ${'IMPORTE'.padStart(10)}`.slice(0, cols), true);
        else push('DESCRIPCION', true);
        rule();
        if (services.length) {
            push('SERVICIOS', true);
            services.forEach((s) => {
                const q = Math.max(1, parseInt(s.quantity) || 1);
                pushItem(q, s.name || 'Servicio', toNum(s.price), toNum(s.price) * q);
            });
        }
        if (parts.length) {
            push('REFACCIONES', true);
            parts.forEach((p) => {
                const q = Math.max(1, parseInt(p.quantity) || 1);
                pushItem(q, p.name || 'Refaccion', toNum(p.price), toNum(p.price) * q);
            });
        }
        if (!services.length && !parts.length && labor > 0) {
            push('SERVICIOS', true);
            pushItem(1, 'Mano de obra', labor, labor);
        }
        rule();
        if (labor > 0) push(lr('Mano de obra:', fmtMoney(labor), cols));
        if (partsTotal > 0) push(lr('Refacciones:', fmtMoney(partsTotal), cols));
    }
    rule('=');
    push(lr('TOTAL:', fmtMoney(total), cols), true);
    rule('=');

    // Pagos
    const valid = payments.filter((p) => !p.cancelled_at);
    const paid = money(valid.reduce((s, p) => s + toNum(p.amount), 0));
    const balance = Math.max(0, money(total - paid));
    if (valid.length) {
        push('PAGOS', true);
        valid.forEach((p) => {
            const m = METHODS[String(p.payment_method || '').toLowerCase()] || 'Otro';
            push(lr(`Pago ${fmtShort(p.payment_date, tz)} (${m})`, fmtMoney(p.amount), cols));
            if (p.receipt_number) push(`  Recibo ${T(p.receipt_number)}`);
        });
        rule();
    }
    push(lr('TOTAL PAGADO:', fmtMoney(paid), cols), true);
    push(lr('SALDO:', fmtMoney(balance), cols), true);
    if (total > 0) pushCentered(balance <= 0 ? '*** PAGADO ***' : '*** SALDO PENDIENTE ***', true);
    rule();

    // Garantía (por defecto: 15 días, solo mano de obra; refacciones y piezas eléctricas sin garantía)
    if (settings.warranty_enabled !== false) {
        const days = Number.isFinite(Number(settings.warranty_days)) ? Number(settings.warranty_days) : 15;
        const base = order.completed_at ? new Date(order.completed_at) : now;
        const until = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        const tpl = (settings.warranty_text && settings.warranty_text.trim()) || DEFAULT_WARRANTY_TEXT;
        const text = tpl.replace(/\{dias\}/g, String(days)).replace(/\{fecha\}/g, fmtDateTime(until, tz, false));
        T(text).split('\n').forEach((para) => wrap(para, cols).forEach((l, i) => push(l, i === 0 && /^GARANTIA|^GARANTÍA/i.test(l))));
        rule();
    }

    // QR de seguimiento
    if (settings.show_qr !== false && order.public_token) {
        const url = publicOrderUrl(order.public_token);
        pushCentered('Sigue tu orden / descarga tu nota:');
        items.push({ qr: url });
        wrap(url.replace(/^https?:\/\//, ''), cols).forEach((l) => push(center(l, cols)));
        rule();
    }

    pushCentered('Este ticket no es factura.');
    if (settings.footer) pushCentered(settings.footer);
    rule('=');
    return { cols, items };
}

/** Ticket de prueba para verificar que la impresora y el ancho están bien. */
export function buildTestDoc(settings = {}, workspace = {}) {
    const cols = settings.paper_cols === 32 ? 32 : 48;
    const items = [];
    const push = (text, bold = false) => items.push({ text, bold });
    const line = (ch) => push(ch.repeat(cols));
    line('=');
    push(center('PRUEBA DE IMPRESION', cols), true);
    push(center(fold(settings.business_name || workspace.name || 'MotoPartes').toUpperCase().slice(0, cols), cols));
    line('=');
    wrap('Si lees esto completo, la impresora y el ancho del papel estan bien.', cols).forEach((l) => push(l));
    push('');
    push('1234567890'.repeat(5).slice(0, cols));
    push('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.padEnd(cols, '.').slice(0, cols));
    push(lr('Izquierda', 'Derecha', cols));
    if (settings.accents) push('Acentos: á é í ó ú ñ Ñ ¿ ¡');
    push('');
    push(center('Listo. Impresora conectada', cols), true);
    line('=');
    return { cols, items };
}

// ───────────────────────── renderizadores ─────────────────────────

export function toPlainText(doc) {
    return doc.items.map((it) => (it.qr ? center('[ QR de seguimiento ]', doc.cols) : it.text)).join('\n');
}

function encodeLine(text, accents) {
    const bytes = [];
    for (const ch of text) {
        const c = ch.codePointAt(0);
        if (c >= 0x20 && c <= 0x7e) bytes.push(c);
        else if (accents && CP850[ch] !== undefined) bytes.push(CP850[ch]);
        else bytes.push(0x3f); // '?'
    }
    return Buffer.from(bytes);
}

/**
 * ESC/POS para térmicas de 80/58 mm.
 * @param {{accents?: boolean, cut?: 'full'|'partial'|'none', qrSize?: number}} opts
 */
export function toEscPos(doc, { accents = false, cut = 'full', qrSize = 6 } = {}) {
    const out = [];
    const b = (...bytes) => out.push(Buffer.from(bytes));
    b(0x1b, 0x40);                       // ESC @   reiniciar
    if (accents) b(0x1b, 0x74, 0x02);    // ESC t 2 tabla PC850
    b(0x1b, 0x61, 0x00);                 // alinear izquierda
    for (const it of doc.items) {
        if (it.qr) {
            const data = Buffer.from(it.qr, 'utf8');
            const len = data.length + 3;
            b(0x1b, 0x61, 0x01);                                          // centrar
            b(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);      // modelo 2
            b(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, qrSize);          // tamaño de módulo
            b(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);            // corrección M
            b(0x1d, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30);  // guardar…
            out.push(data);
            b(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);            // …e imprimir
            b(0x0a);
            b(0x1b, 0x61, 0x00);
            continue;
        }
        if (it.bold) b(0x1b, 0x45, 0x01);
        out.push(encodeLine(it.text, accents));
        if (it.bold) b(0x1b, 0x45, 0x00);
        b(0x0a);
    }
    b(0x0a, 0x0a, 0x0a, 0x0a);           // avance para que el corte no pase por el texto
    if (cut === 'full') b(0x1d, 0x56, 0x00);
    else if (cut === 'partial') b(0x1d, 0x56, 0x01);
    return Buffer.concat(out);
}

/** PDF de 80 mm de ancho con el mismo contenido (para enviar por WhatsApp). */
export function toPdf80(doc) {
    const MM = 72 / 25.4;
    const pageW = 80 * MM;
    const fontSize = doc.cols === 32 ? 9.5 : 7;
    const lh = fontSize * 1.28;
    const charW = fontSize * 0.6; // Courier
    const marginX = Math.max(6, (pageW - doc.cols * charW) / 2);
    const qrSide = 34 * MM;
    const top = 14, bottom = 14;
    const height = top + bottom + doc.items.reduce((h, it) => h + (it.qr ? qrSide + 6 : lh), 0);

    return new Promise((resolve, reject) => {
        try {
            const pdf = new PDFDocument({ size: [pageW, height], margin: 0, info: { Title: 'Ticket de servicio' } });
            const chunks = [];
            pdf.on('data', (c) => chunks.push(c));
            pdf.on('end', () => resolve(Buffer.concat(chunks)));
            pdf.on('error', reject);
            let y = top;
            for (const it of doc.items) {
                if (it.qr) {
                    const qr = QRCode.create(it.qr, { errorCorrectionLevel: 'M' });
                    const n = qr.modules.size, quiet = 2, mod = qrSide / (n + quiet * 2);
                    const x0 = (pageW - qrSide) / 2;
                    pdf.fillColor('black');
                    for (let r = 0; r < n; r++) {
                        for (let c = 0; c < n; c++) {
                            if (qr.modules.get(r, c)) pdf.rect(x0 + (c + quiet) * mod, y + (r + quiet) * mod, mod + 0.02, mod + 0.02).fill();
                        }
                    }
                    y += qrSide + 6;
                } else {
                    pdf.font(it.bold ? 'Courier-Bold' : 'Courier').fontSize(fontSize).fillColor('black')
                        .text(it.text, marginX, y, { lineBreak: false });
                    y += lh;
                }
            }
            pdf.end();
        } catch (e) { reject(e); }
    });
}
