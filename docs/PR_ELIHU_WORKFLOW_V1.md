# PR: ELIHU Workflow v1 — flujo cotización→orden, abonos/saldo, comisión variable, permisos

**Rama:** `feature/elihu-workflow-v1` → **base:** `main`
**Commits:** `72835c2` (base backend) · `5ca0bb4` (UI end-to-end)

## Resumen de cambios
Mejora integral del flujo real de ELIHU sin reescribir lo existente:
- **Clientes**: búsqueda por nombre (acentos/placas) + historial (`GET /clients/search`, `GET /clients/:id/history`) y UI conectada.
- **Cotización → Orden**: la conversión existente ahora crea la orden en estado **“Autorizada”**.
- **Pagos/abonos**: nuevo modelo `OrderPayment`, saldo pendiente, estado de pago, recibo con folio (`/api/order-payments/*`) + sección UI en detalle de orden.
- **Comisión variable** sobre mano de obra, se libera solo al liquidar (`/api/earnings/order/:id/commission`) + UI.
- **Permisos reales**: auxiliar recibe 403 en precios/pagos/comisión/borrado (backend) y botones ocultos (frontend).
- **Fotos**: `expires_at` (retención 30 días) + tipos de foto.
- **Fecha estimada de entrega**, **dashboard** (Autorizadas / por autorizar / entregas próximas), **PDF** orden + recibo, texto WhatsApp “La moto está lista para entregar”.

## Migración incluida
`migrations/007_elihu_workflow.sql` — **aditiva, idempotente, no destructiva**:
`estimated_delivery_at`, `order_photos.expires_at` (+backfill), `mechanic_earnings.commission_status/released_at` (+backfill), tabla `order_payments` (+folio trigger +backfill de `advance_payment`), estado “Autorizada” por workspace, índice de búsqueda por nombre (trgm con fallback btree).

## Cómo probar
1. `psql "$DATABASE_URL" -f migrations/007_elihu_workflow.sql`
2. `cd apps/api && npx prisma generate && npm test` (43/43)
3. `cd apps/frontend && npm run build`
4. E2E: ver `docs/MOTOPARTES-ELIHU-WORKFLOW-V1-QA.md`.

## Riesgos
- En el flujo de abonos, las comisiones se crean al fijar el % (no en el `mark_as_paid` legacy). Documentado en REPORT §26.
- Índice `pg_trgm` requiere privilegio `CREATE EXTENSION`; la migración cae a btree si no lo hay.

## No destructivo
Solo `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` / inserts condicionados. No borra columnas, filas ni estados.

## Pendientes
Ver `docs/MOTOPARTES-ELIHU-WORKFLOW-V1-REPORT.md` PARTE 2 §6. No incluye otros cambios fuera del flujo ELIHU.
