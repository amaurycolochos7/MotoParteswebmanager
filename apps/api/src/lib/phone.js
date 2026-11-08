// Telefonos de Mexico: un solo formato para guardar y comparar.
// Se guarda siempre en 10 dígitos; para buscar se aceptan las variantes con lada (52, 521, +52).

/** Solo dígitos. */
export const digits = (raw) => String(raw ?? '').replace(/\D/g, '');

/**
 * Devuelve los 10 dígitos nacionales, o null si no se puede (no son 10 dígitos
 * tras quitar el prefijo de país 52 / 521).
 */
export function toLocal10(raw) {
    let d = digits(raw);
    if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
    else if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
    return /^\d{10}$/.test(d) ? d : null;
}

/** Todas las formas en que un mismo número pudo guardarse (para `phone: { in: [...] }`). */
export function phoneVariants(raw) {
    const p = toLocal10(raw);
    if (!p) {
        const d = digits(raw);
        return d ? [d] : [];
    }
    return [p, `52${p}`, `+52${p}`, `521${p}`, `+521${p}`];
}

/** Número que entiende el bot de WhatsApp: 52 + 10 dígitos (MX) o los dígitos tal cual (otro país). */
export function toWaNumber(raw) {
    const local = toLocal10(raw);
    return local ? `52${local}` : digits(raw);
}

/** 9611234567 -> "961 123 4567" (para mostrarlo en mensajes). Si no es de 10 dígitos devuelve ''. */
export function formatPhone(raw) {
    const p = toLocal10(raw);
    return p ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : '';
}

/** "Juan Pérez López" -> "Juan P." solo se usa donde se necesite ocultar apellidos. */
export function shortName(full) {
    const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}
