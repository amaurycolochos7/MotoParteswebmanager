# MotoPartes — ELIHU Workflow v1 — QA Manual

> Rama: `feature/elihu-workflow-v1`. Ejecutar tras aplicar `migrations/007_elihu_workflow.sql` en staging.
> ✅ = verificado automáticamente con unit tests · 🔲 = requiere DB/UI (manual en staging).

## A. Automatizado (ya verificado en local — `npm test`, 43/43)

- [✅] `normalize` quita acentos y baja a minúsculas (`José` → `jose`).
- [✅] Búsqueda por nombre parcial y por dígitos de teléfono; placas.
- [✅] `buildClientSearchWhere` devuelve null bajo 2 caracteres y no genera cláusula de teléfono vacía.
- [✅] Ranking exacto > prefijo > contiene > teléfono.
- [✅] Finanzas: Pendiente / Parcial / Pagada; ignora abonos cancelados; sobrepago reportado.
- [✅] `validateNewPayment` bloquea 0, negativo, NaN y sobrepago (salvo flag).
- [✅] Comisión sobre mano de obra, porcentaje variable (`500 @ 30% = 150`).
- [✅] Comisión NO se libera con abono parcial; pasa a READY_TO_PAY al liquidar.
- [✅] `PAID`/`CANCELLED` son terminales; cancelar orden cancela comisión.

## B. Backend en staging (manual con token de cada rol)

### Clientes
- [🔲] `GET /api/clients/search?q=jos` encuentra “José” (sin acento).
- [🔲] `GET /api/clients/search?q=555` encuentra por teléfono.
- [🔲] Crear cliente con teléfono duplicado → 409.
- [🔲] `GET /api/clients/:id/history` muestra órdenes, cotizaciones, saldo, última visita.
- [🔲] Auxiliar `DELETE /api/clients/:id` → 403. Owner/admin → 200.

### Cotización → Orden
- [🔲] Crear cotización, aceptarla, `POST /quotations/:id/convert`.
- [🔲] La orden creada tiene estado **“Autorizada”**.
- [🔲] Segundo `convert` devuelve `already_converted: true` (sin duplicar).

### Abonos / saldo / recibo
- [🔲] `POST /order-payments` con monto válido → 201; `finance.balance` baja.
- [🔲] Monto 0 o negativo → 400. Sobrepago sin permiso → 400.
- [🔲] Segundo abono que liquida → `payment_status: "Pagada"`, orden `is_paid: true`.
- [🔲] Comisión del mecánico pasa a `READY_TO_PAY` solo tras liquidar.
- [🔲] `POST /order-payments/:id/cancel` → pago marcado cancelado (no borrado); saldo recalcula.
- [🔲] `GET /order-payments/:id/receipt` trae folio `REC-...`, saldo, total pagado.

### Permisos (rol auxiliar)
- [🔲] `PUT /orders/:id/paid` → 403. `PUT /orders/:id/costs` → 403.
- [🔲] `POST /orders/:id/parts` → 403. `DELETE /orders/:id` → 403.
- [🔲] `POST /orders` (crear) → permitido si el rol lo permite.
- [🔲] `PUT /orders/:id` con `total_amount` en el body → se ignora el campo (no cambia el total).

### Fotos
- [🔲] `POST /photos` setea `expires_at` ≈ +30 días.
- [🔲] Foto con < 30 días NO se borra.

## C. Frontend / móvil (manual, tras conectar UI)

- [🔲] Buscador de cliente por nombre visible y rápido en cotización/orden.
- [🔲] Historial del cliente legible en celular.
- [🔲] Registrar abono y ver saldo pendiente actualizado.
- [🔲] Descargar/ver recibo.
- [🔲] Estado “Lista para Entregar” visible.
- [🔲] Botones de precio/pago/comisión ocultos o deshabilitados para auxiliar.

## D. E2E flujo completo (manual)

1. [🔲] Crear cliente + moto.
2. [🔲] Cotización con falla, diagnóstico, mano de obra y refacciones.
3. [🔲] Aceptar y convertir → orden **Autorizada**.
4. [🔲] Comisión 30% sobre mano de obra.
5. [🔲] Primer abono → saldo > 0, comisión **NO** liberada.
6. [🔲] Segundo abono liquida → saldo 0, comisión **READY_TO_PAY**.
7. [🔲] Estado “Lista para Entregar”.
8. [🔲] Generar recibo / PDF. Sin errores en consola ni backend.

## E. No-regresión

- [🔲] Login funciona.
- [🔲] Dashboard, clientes, órdenes y cotizaciones existentes cargan.
- [🔲] Órdenes/cotizaciones previas intactas (datos no alterados por la migración).
