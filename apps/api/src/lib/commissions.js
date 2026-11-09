// Comisiones (V2): UN solo lugar para el cálculo que antes estaba duplicado en dos bloques de orders.js.
//
// Reglas (idénticas a las anteriores):
//  - La comisión se calcula sobre la MANO DE OBRA de la orden (labor_total).
//  - Mecánico normal (o auxiliar sin supervisor): gana labor * su porcentaje.
//  - Auxiliar CON supervisor: el auxiliar gana labor * su porcentaje y el resto va al maestro.
//    Si la suma de porcentajes (auxiliar + maestro) pasa de 100 se escalan proporcionalmente.
//  - Cada fila nace con commission_status = PENDING_PAYMENT (la libera el pago completo del cliente).

import { computeOrderFinance, nextCommissionStatus } from './payments.js';

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/** Lunes 00:00 de la semana de `date`, hora local del servidor (comportamiento previo). */
export function weekStartMonday(date = new Date()) {
    const d = new Date(date);
    const dow = d.getDay(); // 0 = domingo
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Cálculo puro del reparto. Devuelve filas { mechanic_id, commission_rate, earned_amount }.
 * @param {{labor:number|string, mechanic:{id, commission_percentage, requires_approval, supervised_by}, supervisor?:{id, commission_percentage}|null}} p
 */
export function computeEarningsRows({ labor, mechanic, supervisor = null }) {
    const laborAmount = num(labor);
    if (!mechanic || laborAmount <= 0) return [];

    const auxRate = num(mechanic.commission_percentage);
    const isAuxiliary = mechanic.requires_approval === true;
    const supervisorId = mechanic.supervised_by || null;

    if (isAuxiliary && supervisorId) {
        let auxEffective = auxRate;
        let masterEffective = supervisor?.commission_percentage != null
            ? num(supervisor.commission_percentage)
            : 100 - auxRate;

        const sum = auxEffective + masterEffective;
        if (sum > 100 && sum > 0) {
            const scale = 100 / sum;
            auxEffective *= scale;
            masterEffective *= scale;
        }

        const auxEarned = laborAmount * (auxEffective / 100);
        const rows = [{ mechanic_id: mechanic.id, commission_rate: auxEffective, earned_amount: auxEarned }];
        if (supervisor) {
            rows.push({ mechanic_id: supervisor.id, commission_rate: masterEffective, earned_amount: laborAmount - auxEarned });
        }
        return rows;
    }

    return [{ mechanic_id: mechanic.id, commission_rate: auxRate, earned_amount: laborAmount * (auxRate / 100) }];
}

/**
 * Recalcula las comisiones de una orden (borra las anteriores y crea las nuevas).
 * `tx` es el cliente de transacción de Prisma. Devuelve las filas creadas.
 */
export async function recalcEarnings(tx, { orderId, workspaceId, mechanicId, laborTotal, now = new Date() }) {
    const labor = num(laborTotal);
    if (!mechanicId || labor <= 0) return [];

    const mechanic = await tx.profile.findUnique({
        where: { id: mechanicId },
        select: { id: true, commission_percentage: true, requires_approval: true, supervised_by: true },
    });
    if (!mechanic) return [];

    let supervisor = null;
    if (mechanic.requires_approval === true && mechanic.supervised_by) {
        supervisor = await tx.profile.findUnique({
            where: { id: mechanic.supervised_by },
            select: { id: true, commission_percentage: true },
        });
    }

    const rows = computeEarningsRows({ labor, mechanic, supervisor });
    if (rows.length === 0) return [];

    const weekStart = weekStartMonday(now);
    await tx.mechanicEarning.deleteMany({ where: { order_id: orderId } });
    const data = rows.map((r) => ({
        workspace_id: workspaceId,
        order_id: orderId,
        mechanic_id: r.mechanic_id,
        labor_amount: labor,
        commission_rate: r.commission_rate,
        earned_amount: r.earned_amount,
        is_paid: false,
        week_start: weekStart,
    }));
    await tx.mechanicEarning.createMany({ data });
    return data;
}

/**
 * Deja la comisión de una orden al día con su mano de obra. Es lo que debe llamarse SIEMPRE que cambia la mano de obra o se
 * registra un pago (antes solo se creaba al marcar la orden pagada por la ruta anterior, y las órdenes cobradas por abonos
 * —el flujo normal— se quedaban sin comisión: la tarjeta marcaba $0.00).
 *  - Sin mecánico o sin mano de obra: no hay comisión (se quitan las filas que aún estén pendientes).
 *  - Una comisión que ya se pagó al mecánico (o se canceló) NUNCA se toca.
 *  - Si ya existe y coincide con la mano de obra actual, no se vuelve a crear (conserva su fecha y su estado).
 */
export async function syncOrderEarnings(tx, { orderId, workspaceId, mechanicId, laborTotal, now = new Date() }) {
    const rows = await tx.mechanicEarning.findMany({ where: { order_id: orderId } });
    if (rows.some((r) => r.is_paid === true || r.commission_status === 'PAID' || r.commission_status === 'CANCELLED')) return rows;
    const labor = num(laborTotal);
    if (!mechanicId || labor <= 0) {
        if (rows.length) await tx.mechanicEarning.deleteMany({ where: { order_id: orderId } });
        return [];
    }
    if (rows.length && rows.every((r) => Math.abs(num(r.labor_amount) - labor) < 0.005)) return rows;
    await recalcEarnings(tx, { orderId, workspaceId, mechanicId, laborTotal: labor, now });
    return tx.mechanicEarning.findMany({ where: { order_id: orderId } });
}

/** ¿Este mecánico es el dueño/administrador del taller? Nadie le "entrega" su comisión: el cobro ya lo tiene él. */
export async function isSelfPaidMechanic(tx, workspaceId, profileId) {
    if (!workspaceId || !profileId) return false;
    const m = await tx.membership.findUnique({
        where: { workspace_id_profile_id: { workspace_id: workspaceId, profile_id: profileId } }, select: { role: true },
    });
    return m?.role === 'owner' || m?.role === 'admin';
}

/**
 * Pone al día el estado de las comisiones de una orden según su pago:
 *   por cobrar (PENDING_PAYMENT) -> liberada (READY_TO_PAY, el cliente ya liquidó) -> pagada (PAID).
 * Si el mecánico es el dueño/administrador, al liquidar la orden su comisión pasa directo a PAID. Nunca baja una PAID/CANCELLED.
 * Usa updateMany (no update): el filtro por taller de Prisma lee la fila fuera de la transacción y NO ve las recién creadas en ella.
 */
export async function applyCommissionStatuses(tx, order, finance) {
    const rows = await tx.mechanicEarning.findMany({ where: { order_id: order.id } });
    for (const e of rows) {
        const selfPaid = await isSelfPaidMechanic(tx, order.workspace_id, e.mechanic_id);
        const next = nextCommissionStatus(e.commission_status, finance, { selfPaid });
        if (next === e.commission_status) continue;
        const data = {
            commission_status: next,
            commission_released_at: next === 'PENDING_PAYMENT' ? null : (e.commission_released_at || new Date()),
        };
        if (next === 'PAID') { data.is_paid = true; data.paid_at = new Date(); }
        await tx.mechanicEarning.updateMany({ where: { id: e.id }, data });
    }
}

/**
 * Libera las comisiones de una orden ya liquidada y deja pendientes las de una que no.
 * Una orden marcada pagada sin abonos (flujo anterior) cuenta como liquidada.
 */
export async function releaseCommissionIfPaid(tx, orderId) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    const payments = await tx.orderPayment.findMany({ where: { order_id: orderId } });
    const finance = computeOrderFinance(order, payments);
    const settled = order.is_paid === true && payments.filter((p) => !p.cancelled_at).length === 0;
    await applyCommissionStatuses(tx, order, settled ? { ...finance, is_fully_paid: true } : finance);
}

// ── Resumen para el inicio / "Mis ganancias" ──────────────────────────────

/** Estado efectivo de una fila (is_paid se conserva por compatibilidad). */
export function effectiveCommissionStatus(row) {
    if (row.commission_status === 'CANCELLED') return 'CANCELLED';
    if (row.is_paid === true || row.commission_status === 'PAID') return 'PAID';
    if (row.commission_status === 'READY_TO_PAY') return 'READY_TO_PAY';
    return 'PENDING_PAYMENT';
}

/** Inicio del periodo (`week` | `month` | `all`) y fin (ahora). */
export function periodRange(period = 'week', now = new Date()) {
    const end = new Date(now);
    if (period === 'all') return { start: null, end };
    if (period === 'month') {
        const s = new Date(now);
        s.setDate(1);
        s.setHours(0, 0, 0, 0);
        return { start: s, end };
    }
    return { start: weekStartMonday(now), end };
}

/**
 * Suma filas de MechanicEarning en el desglose del contrato.
 * @param {Array} rows  filas con earned_amount, labor_amount, commission_status, is_paid, order_id
 */
export function summarizeEarnings(rows) {
    const out = { por_cobrar: 0, liberada: 0, pagada: 0, total_comision: 0, labor_total: 0, orders: new Set() };
    for (const r of rows) {
        const status = effectiveCommissionStatus(r);
        if (status === 'CANCELLED') continue;
        const earned = num(r.earned_amount);
        if (status === 'PAID') out.pagada += earned;
        else if (status === 'READY_TO_PAY') out.liberada += earned;
        else out.por_cobrar += earned;
        out.total_comision += earned;
        out.labor_total += num(r.labor_amount);
        out.orders.add(r.order_id);
    }
    const round = (n) => Math.round(n * 100) / 100;
    return {
        orders_count: out.orders.size,
        por_cobrar: round(out.por_cobrar),
        liberada: round(out.liberada),
        pagada: round(out.pagada),
        total_comision: round(out.total_comision),
        labor_total: round(out.labor_total),
    };
}
