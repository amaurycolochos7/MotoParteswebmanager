// Ingresos del taller. Una orden cobrada trae DOS cosas distintas que no deben sumarse como "ingreso":
//   - mano de obra (labor_total): lo que gana el taller por el trabajo;
//   - refacciones (parts_total): el dinero de las piezas, que se va en comprarlas (no es ganancia).
// "Total cobrado" es la suma de ambas (lo que pagaron los clientes).
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Cobro de las órdenes pagadas dentro de [from, to) según su fecha de pago. Devuelve { labor, parts, total, count }. */
export function paidRevenue(orders, from, to = null) {
  let labor = 0; let total = 0; let count = 0;
  for (const o of orders || []) {
    if (o.is_paid !== true) continue;
    const d = new Date(o.paid_at || o.created_at);
    if (Number.isNaN(d.getTime()) || d < from || (to && d >= to)) continue;
    const t = num(o.total_amount);
    const l = Math.min(num(o.labor_total), t); // la mano de obra nunca pasa del total de la orden
    labor += l; total += t; count += 1;
  }
  return { labor, parts: Math.max(0, total - labor), total, count };
}

/** Lo cobrado en el mes calendario de `now`. */
export function monthRevenue(orders, now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return paidRevenue(orders, from, to);
}
