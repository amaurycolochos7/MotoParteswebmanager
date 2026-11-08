// Logica PURA de la reserva de citas en linea (sin base de datos, para poder probarla sola).
// La usan routes/public.js y lib/appointment-flow.js.
import { toLocal10 } from './phone.js';

// Citas por hora para UN mecanico elegido (el cupo global SLOT_CAPACITY sigue aplicando).
export const MECHANIC_SLOT_CAPACITY = 1;
// Solicitudes pendientes de respuesta que un mismo telefono puede tener a la vez.
export const MAX_PENDING_PER_PHONE = 5;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MSG_PICK_MECHANIC = 'Elige quién te atiende.';

// ── Texto ────────────────────────────────────────────────────────────────
/** Minusculas, sin acentos, espacios simples. */
export function norm(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Para comparar marcas/modelos: "CB 190-R" y "cb190r" son lo mismo. */
export const compact = (s) => norm(s).replace(/[^a-z0-9ñ]/g, '');

export const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// ── Motos ────────────────────────────────────────────────────────────────
export function buildMotoLabel({ marca, modelo, anio }) {
    return [marca, modelo, anio].filter(Boolean).join(' ');
}

/**
 * ¿Es la misma moto? Misma marca y modelo (sin importar mayusculas, acentos ni guiones);
 * el año debe coincidir salvo que alguna de las dos no lo tenga capturado.
 */
export function sameMoto(a, b) {
    if (compact(a.brand ?? a.marca) !== compact(b.brand ?? b.marca)) return false;
    if (compact(a.model ?? a.modelo) !== compact(b.model ?? b.modelo)) return false;
    const ya = a.year ?? a.anio ?? null;
    const yb = b.year ?? b.anio ?? null;
    if (ya == null || yb == null || ya === '' || yb === '') return true;
    return Number(ya) === Number(yb);
}

/** Busca entre las motos del cliente la que coincide con {marca, modelo, anio}. */
export function findSameMoto(motos, wanted) {
    return (motos || []).find((m) => sameMoto(m, wanted)) || null;
}

// ── Validacion de la solicitud ───────────────────────────────────────────
/**
 * Limpia y valida lo que llega del formulario. Lo que depende de si el cliente ya existe
 * (nombre, moto) se revisa despues con `customerInputError`.
 * @returns {{ error: string } | { data: object }}
 */
export function validateBookingBody(body = {}) {
    const phone = toLocal10(body.telefono);
    if (!phone) return { error: 'Teléfono inválido — debe tener 10 dígitos.' };

    const mecanicoId = typeof body.mecanico_id === 'string' ? body.mecanico_id.trim() : '';
    if (!mecanicoId || !UUID_RE.test(mecanicoId)) return { error: MSG_PICK_MECHANIC };

    const servicio = clean(body.tipo_servicio, 120);
    const fecha = clean(body.fecha, 10);
    const hora = clean(body.hora, 5);
    if (!fecha || !hora) return { error: 'Fecha y hora son obligatorias.' };
    if (!servicio) return { error: 'El tipo de servicio es obligatorio.' };

    const anio = clean(String(body.moto_anio ?? ''), 4);
    if (anio && !/^\d{4}$/.test(anio)) return { error: 'El año de la moto no es válido.' };

    const motoId = typeof body.moto_id === 'string' && body.moto_id.trim() ? body.moto_id.trim() : '';
    if (motoId && !UUID_RE.test(motoId)) return { error: 'La moto elegida no es válida.' };

    return {
        data: {
            phone,
            mecanicoId,
            nombre: clean(body.nombre, 80),
            servicio,
            notas: typeof body.notas === 'string' ? body.notas.trim().slice(0, 1000) : '',
            fecha,
            hora,
            motoId,
            marca: clean(body.moto_marca, 40),
            modelo: clean(body.moto_modelo, 60),
            anio,
        },
    };
}

/** Revisiones que dependen de si el cliente ya existe. Devuelve el mensaje de error o null. */
export function customerInputError(data, hasClient) {
    if (!hasClient && !data.nombre) return 'El nombre es obligatorio.';
    if (data.motoId) {
        if (!hasClient) return 'La moto elegida no es válida.';
        return null; // la pertenencia al cliente se comprueba con la base de datos
    }
    if (!data.marca || !data.modelo) return 'Indica la marca y el modelo de la moto.';
    return null;
}

// ── Cupo de horarios ─────────────────────────────────────────────────────
/**
 * @param {{ slot: string, mechanic_id: string|null }[]} rows una fila por cita/propuesta que aparta horario
 * @returns {{ total: Record<string, number>, byMechanic: Record<string, Record<string, number>> }}
 */
export function occupancy(rows) {
    const total = {};
    const byMechanic = {};
    for (const r of rows) {
        total[r.slot] = (total[r.slot] || 0) + 1;
        if (r.mechanic_id) {
            const m = (byMechanic[r.mechanic_id] ||= {});
            m[r.slot] = (m[r.slot] || 0) + 1;
        }
    }
    return { total, byMechanic };
}

/** ¿Hay lugar a esa hora? Con mecanico: su propio cupo Y el cupo global del taller. */
export function isSlotOpen(occ, hora, { capacity, mechanicId = null, mechanicCapacity = MECHANIC_SLOT_CAPACITY }) {
    if ((occ.total[hora] || 0) >= capacity) return false;
    if (mechanicId && (occ.byMechanic[mechanicId]?.[hora] || 0) >= mechanicCapacity) return false;
    return true;
}

// ── Limite de intentos en memoria ────────────────────────────────────────
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
    const map = new Map();
    return {
        /** Cuenta un intento. Devuelve true si ya se paso del limite. */
        hit(key) {
            const t = now();
            const e = map.get(key);
            if (!e || t - e.since > windowMs) { map.set(key, { count: 1, since: t }); return false; }
            if (e.count >= max) return true;
            e.count += 1;
            return false;
        },
        sweep() {
            const t = now();
            for (const [k, v] of map) if (t - v.since > windowMs) map.delete(k);
        },
        size: () => map.size,
    };
}

// ── Aviso al mecanico (sin emojis) ───────────────────────────────────────
/**
 * @param {'requested'|'customerChose'|'customerCancelled'|'assigned'} kind
 * @param {object} c textos ya formateados: { mecanico, cliente, telefono, moto, servicio, fecha, hora, notas, link, shop }
 */
export function mechanicNoticeText(kind, c) {
    const first = String(c.mecanico || '').split(' ')[0];
    const hi = first ? `Hola ${first}, ` : '';
    const lines = [];
    const detail = () => {
        lines.push('');
        lines.push(`Cliente: ${c.cliente || 'Sin nombre'}`);
        if (c.telefono) lines.push(`Teléfono: ${c.telefono}`);
        if (c.moto) lines.push(`Moto: ${c.moto}`);
        if (c.servicio) lines.push(`Servicio: ${c.servicio}`);
        lines.push(`Fecha: ${c.fecha}`);
        lines.push(`Hora: ${c.hora}`);
        if (c.notas) lines.push(`Notas: ${String(c.notas).slice(0, 200)}`);
    };
    const tail = (verb) => {
        lines.push('');
        lines.push(`${verb}, entra con tu usuario aquí:`);
        lines.push(c.link);
    };
    const shop = c.shop || 'MOTOPARTES';
    if (kind === 'requested') {
        lines.push(`${hi}tienes una nueva solicitud de cita en ${shop}. El cliente te eligió a ti para atenderlo.`);
        detail();
        tail('Para revisarla, aceptarla o proponer otro horario');
    } else if (kind === 'assigned') {
        lines.push(`${hi}te asignaron una cita en ${shop}.`);
        detail();
        tail('Para verla');
    } else if (kind === 'customerChose') {
        lines.push(`${hi}tu cliente pidió cambiar el horario de su cita en ${shop}.`);
        detail();
        tail('Para revisar el cambio');
    } else if (kind === 'customerCancelled') {
        lines.push(`${hi}tu cliente canceló su cita en ${shop}.`);
        detail();
        tail('Para verla');
    } else {
        throw new Error(`Aviso de mecánico desconocido: ${kind}`);
    }
    return lines.join('\n');
}
