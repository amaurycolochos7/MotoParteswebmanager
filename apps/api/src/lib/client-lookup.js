// Logica pura (sin base de datos) de la busqueda "Buscar cliente" del panel.
// Se separa de la ruta para poder probarla con node:test (test/client-lookup.test.js).

const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');

/** True cuando la consulta es un telefono (solo digitos y separadores comunes). */
export function isPhoneQuery(rawQuery) {
    const q = String(rawQuery ?? '').trim();
    return q.length > 0 && /^[\d\s()+.-]+$/.test(q);
}

/**
 * Arma el `where` de Prisma para la busqueda.
 *  - Telefono: 3+ digitos (cualquier parte: ultimos 4, completo, con lada).
 *  - Texto: 3+ caracteres, busca en nombre, placas, marca y modelo (sin distinguir mayusculas).
 * Devuelve null si la consulta es muy corta (la ruta responde []).
 */
export function buildLookupWhere(rawQuery) {
    const q = String(rawQuery ?? '').trim();
    if (isPhoneQuery(q)) {
        const d = digitsOnly(q);
        if (d.length < 3) return null;
        return { phone: { contains: d } };
    }
    if (q.length < 3) return null;
    return {
        OR: [
            { full_name: { contains: q, mode: 'insensitive' } },
            { motorcycles: { some: { plates: { contains: q, mode: 'insensitive' } } } },
            { motorcycles: { some: { brand: { contains: q, mode: 'insensitive' } } } },
            { motorcycles: { some: { model: { contains: q, mode: 'insensitive' } } } },
        ],
    };
}

/** Un servicio "hecho" es una orden en estado terminal que NO es una cancelacion. */
export function isFinishedService(o) {
    return o?.status?.is_terminal === true && !/cancel/i.test(String(o.status.name || ''));
}

/**
 * Resumen de la linea de tiempo de una moto a partir de sus ordenes ya cargadas.
 * Solo las ordenes terminadas y no canceladas cuentan como servicios hechos; las canceladas
 * se muestran en la linea de tiempo pero no suman.
 * orders: [{ status:{is_terminal,name}, total_amount, completed_at, created_at }]
 */
export function summarizeHistory(orders) {
    const list = Array.isArray(orders) ? orders : [];
    const finished = list.filter(isFinishedService);
    const open = list.filter((o) => !o.status || o.status.is_terminal === false);
    const dateOf = (o) => new Date(o.completed_at || o.created_at).getTime();
    const last = finished.length > 0 ? Math.max(...finished.map(dateOf)) : null;
    return {
        services_count: finished.length,
        total_spent: round2(finished.reduce((s, o) => s + Number(o.total_amount || 0), 0)),
        last_visit_at: last ? new Date(last).toISOString() : null,
        open_orders: open.length,
    };
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
