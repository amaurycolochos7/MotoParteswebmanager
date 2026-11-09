// Comisiones que faltaron: las órdenes cobradas por abonos (el flujo normal) no generaban su comisión (solo se creaba al marcar la
// orden pagada por otra ruta), así que la tarjeta "Tu comisión" marcaba $0.00 aunque "Ingresos del mes" sí las contaba.
// Esta migración (idempotente) crea la comisión de las órdenes YA COBRADAS este mes que no tienen ninguna.
//
// Solo el mes en curso, a propósito: las órdenes de meses anteriores pueden haberse pagado por fuera del sistema de comisiones y
// reabrirlas inflaría de golpe lo que se le debe a cada mecánico.
import prisma, { workspaceContext } from './prisma.js';
import { syncOrderEarnings, releaseCommissionIfPaid } from './commissions.js';

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);

/** Primer instante del mes de `date` (hora del servidor, igual que "Ingresos del mes" y el periodo "Mes" de la comisión). */
export function monthStart(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Crea la comisión faltante de las órdenes cobradas desde `since`. Devuelve cuántas órdenes arregló. */
export async function backfillMissingEarnings(workspaceId, { since = monthStart() } = {}) {
    const orders = await unscoped(() => prisma.order.findMany({
        where: {
            workspace_id: workspaceId, is_paid: true, paid_at: { gte: since },
            mechanic_id: { not: null }, labor_total: { gt: 0 },
            earnings: { none: {} },
            NOT: { status: { name: { contains: 'cancel', mode: 'insensitive' } } },
        },
        select: { id: true, workspace_id: true, mechanic_id: true, labor_total: true },
        take: 500,
    }));
    let fixed = 0;
    for (const o of orders) {
        await unscoped(() => prisma.$transaction(async (tx) => {
            const rows = await syncOrderEarnings(tx, { orderId: o.id, workspaceId: o.workspace_id, mechanicId: o.mechanic_id, laborTotal: o.labor_total });
            if (rows.length) { await releaseCommissionIfPaid(tx, o.id); fixed += 1; }
        }));
    }
    return fixed;
}
