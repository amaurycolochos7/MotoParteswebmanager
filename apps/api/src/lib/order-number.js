import prisma, { workspaceContext } from './prisma.js';

/**
 * Generate an order number of the form "<PREFIX>-YY-NNN".
 *
 * `order_number` has a GLOBAL unique constraint, so we look up the max
 * existing suffix across ALL workspaces sharing this prefix-year (bypassing
 * the workspace auto-scope). Using MAX instead of COUNT survives row
 * deletions, which used to cause P2002 collisions when the running count
 * dropped below the largest existing suffix.
 *
 * ponytail: single source of truth for order folio generation.
 * Ceiling: raw SQL per call; upgrade path: DB sequence or advisory lock.
 *
 * @param {string} prefix - The workspace folio prefix (e.g. "MP")
 * @returns {Promise<string>} e.g. "MP-26-042"
 */
export async function generateOrderNumber(prefix) {
    const shortYear = String(new Date().getFullYear()).slice(-2);
    const prefixYear = `${prefix}-${shortYear}-`;
    const rows = await workspaceContext.run({ workspaceId: null }, () =>
        prisma.$queryRaw`
            SELECT order_number FROM orders
            WHERE order_number LIKE ${prefixYear + '%'}
            ORDER BY LENGTH(order_number) DESC, order_number DESC
            LIMIT 1
        `
    );
    let next = 1;
    if (rows.length > 0) {
        const lastSuffix = String(rows[0].order_number).slice(prefixYear.length);
        const lastNum = parseInt(lastSuffix, 10);
        if (!Number.isNaN(lastNum) && lastNum >= next) next = lastNum + 1;
    }
    return `${prefixYear}${String(next).padStart(3, '0')}`;
}
