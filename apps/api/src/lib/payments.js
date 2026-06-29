// Pure, DB-free domain logic for client payments (abonos) and commission
// release. Kept separate from routes so it is unit-testable without Postgres.
//
// ELIHU's requirements encoded here:
//   - Several abonos per order; show running total + saldo pendiente.
//   - Payment status: Pendiente | Parcial | Pagada.
//   - No negative / zero payments. Block overpayment unless explicitly allowed.
//   - Commission is over LABOR ONLY, variable rate per order/work.
//   - Commission is NOT released on each abono — only when the client liquidates
//     the FULL balance.
//
// All money is handled as Number (pesos with cents). Callers pass Prisma
// Decimal values through `toNum`. ponytail: Number is fine for MXN amounts in
// this domain (well under 2^53 cents); upgrade path is a Decimal lib if we ever
// handle fractional-cent or multi-currency arithmetic.

/** Coerce Prisma Decimal | string | number | null to a finite Number. */
export function toNum(v) {
    if (v == null) return 0;
    const n = typeof v === 'object' && typeof v.toString === 'function' ? Number(v.toString()) : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** Round to 2 decimals to avoid float dust (e.g. 0.1 + 0.2). */
export function money(n) {
    return Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Compute order finance from its total and the list of NON-cancelled payments.
 * `payments` items use { amount, cancelled_at }.
 */
export function computeOrderFinance(order, payments = []) {
    const total = money(order?.total_amount ?? 0);
    const paid = money(
        payments
            .filter((p) => !p.cancelled_at)
            .reduce((sum, p) => sum + toNum(p.amount), 0)
    );
    const balance = money(total - paid);
    let payment_status = 'Pendiente';
    if (paid <= 0) payment_status = 'Pendiente';
    else if (balance > 0) payment_status = 'Parcial';
    else payment_status = 'Pagada';

    return {
        total,
        paid,
        balance: balance < 0 ? 0 : balance,
        overpaid: balance < 0 ? money(-balance) : 0,
        is_fully_paid: balance <= 0 && total > 0,
        payment_status,
    };
}

/**
 * Validate a new abono BEFORE persisting. Returns { ok, error } — never throws.
 * `currentBalance` is the saldo pendiente before this payment.
 */
export function validateNewPayment(amountRaw, currentBalance, { allowOverpay = false } = {}) {
    const amount = toNum(amountRaw);
    if (!Number.isFinite(amount)) return { ok: false, error: 'Monto inválido' };
    if (amount <= 0) return { ok: false, error: 'El monto debe ser mayor a 0' };
    const balance = money(currentBalance);
    if (!allowOverpay && money(amount) > balance) {
        return {
            ok: false,
            error: `El monto ($${money(amount)}) excede el saldo pendiente ($${balance}).`,
        };
    }
    return { ok: true, amount: money(amount) };
}

const VALID_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];
export function normalizePaymentMethod(method) {
    const m = String(method ?? '').toLowerCase().trim();
    return VALID_METHODS.includes(m) ? m : 'otro';
}

/**
 * Compute commission for an order. Variable rate over LABOR only.
 * `ratePercent` is e.g. 30 for 30%.
 */
export function computeCommission(laborTotalRaw, ratePercentRaw) {
    const base = money(laborTotalRaw);
    const rate = toNum(ratePercentRaw);
    const amount = money((base * rate) / 100);
    return { base, rate, amount };
}

/**
 * Decide the commission_status given current payment state.
 * Lifecycle: PENDING_PAYMENT -> READY_TO_PAY (on full liquidation) -> PAID.
 * CANCELLED is terminal. We never downgrade PAID/CANCELLED here.
 */
export function nextCommissionStatus(current, finance, { orderCancelled = false } = {}) {
    if (current === 'PAID' || current === 'CANCELLED') return current;
    if (orderCancelled) return 'CANCELLED';
    if (finance.is_fully_paid) return 'READY_TO_PAY';
    return 'PENDING_PAYMENT';
}

export const COMMISSION_STATUSES = ['PENDING_PAYMENT', 'READY_TO_PAY', 'PAID', 'CANCELLED'];
export const PAYMENT_METHODS = VALID_METHODS;
