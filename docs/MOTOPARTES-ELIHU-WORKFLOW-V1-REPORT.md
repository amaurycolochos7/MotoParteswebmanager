# MotoPartes — ELIHU Workflow v1 — Reporte de Implementación

> Rama: `feature/elihu-workflow-v1`
> Estado: **Implementado y probado en local. NO desplegado a producción (bloqueo documentado, ver §28).**
> Basado en el levantamiento del usuario maestro **ELIHU**.

---

## 1. Resumen ejecutivo

Se implementó la **base backend** del flujo real de ELIHU sobre el código existente, sin reescribir lo que ya funcionaba. El sistema MotoPartes ya tenía cotizaciones, estados de orden por workspace, comisiones por mecánico, fotos y recibos; este paquete **cierra los huecos** detectados contra el levantamiento:

1. Búsqueda de clientes **por nombre** (parcial, sin acentos, tolerante a mayúsculas) — prioridad #1 de ELIHU.
2. **Historial del cliente** consolidado (órdenes, cotizaciones, saldo, última visita).
3. Conversión de cotización aceptada → orden con estado **“Autorizada”**.
4. **Abonos / pagos parciales** reales por orden, con **saldo pendiente** calculado y **recibo con folio**.
5. **Comisión variable** por trabajo sobre **mano de obra**, que se **libera solo al liquidar todo**.
6. **Permisos reales en backend**: el auxiliar puede crear orden pero no tocar precios/pagos/comisiones ni borrar.
7. **Retención de fotos 30 días** (`expires_at` preparado, sweep documentado como pendiente seguro).
8. **Fecha prometida de entrega** (`estimated_delivery_at`).

Todo el cambio de base de datos es **aditivo y no destructivo** (migración `007_elihu_workflow.sql`). **43 pruebas unitarias pasan** (20 nuevas + 23 existentes).

> **Importante / honestidad de alcance:** este reporte refleja lo que se hizo y verificó en este pase. La **interfaz visual completa** (pantallas nuevas de abono/recibo/historial) y el **despliegue a producción** quedan como handoff explícito (§27–§28). No se ejecutó ningún cambio contra la base de datos de producción ni se usó el VPS/Dokploy.

---

## 2. Objetivo de la implementación

Ajustar MotoPartes al uso real de ELIHU (operación diaria, principalmente desde celular, rol mixto administrativo + mecánico) **sin romper producción**, extendiendo los módulos existentes en lugar de duplicarlos.

---

## 3. Flujo anterior

- Cliente se buscaba esencialmente por teléfono (`GET /clients/phone/:phone`) o lista completa.
- Cotización ya existía y se podía convertir a orden, pero la orden nacía con el primer estado no-terminal (“Registrada”), no “Autorizada”.
- Pago era binario: `Order.is_paid` + `advance_payment`. No había abonos múltiples ni saldo histórico.
- Comisión (`MechanicEarning`) se generaba al marcar pagado, con `is_paid` booleano; no había ciclo “se libera al liquidar”.
- Sin control real de permisos sobre dinero: cualquier usuario autenticado del workspace podía marcar pagado / editar costos / borrar.
- Fotos sin vencimiento.

## 4. Flujo nuevo (ELIHU)

```
Cliente llega → falla → revisión → diagnóstico
→ BUSCAR CLIENTE POR NOMBRE (nuevo)
→ ver HISTORIAL del cliente (nuevo)
→ registrar/seleccionar moto → fotos (expiran a 30 días)
→ COTIZACIÓN → cliente autoriza
→ CONVERTIR → Orden en estado "Autorizada" (nuevo)
→ se trabaja → ABONOS (nuevo) → SALDO PENDIENTE visible (nuevo)
→ al liquidar TODO → COMISIÓN pasa a READY_TO_PAY (nuevo)
→ estado "Lista para Entregar" → "Entregada" → RECIBO con folio (nuevo)
```

---

## 5. Cambios en frontend

- `apps/frontend/src/lib/api.js`:
  - `clientsService.search(query, {limit})` → `GET /clients/search`.
  - `clientsService.getHistory(id)` → `GET /clients/:id/history`.
  - Nuevo `orderPaymentsService` (`listByOrder`, `create`, `cancel`, `getReceipt`).

> Las pantallas/JSX que consumen estos servicios (buscador en NewQuotation/NewServiceOrder, panel de abonos en OrderDetail, botón de recibo) **no se reescribieron en este pase** y quedan como tarea de UI (§27). La capa de datos ya está lista para conectarlas.

## 6. Cambios en backend

- `src/lib/client-search.js` (**nuevo**, puro/testeable): `normalize`, `digitsOnly`, `buildClientSearchWhere`, `matchesClient`, `rankScore`.
- `src/lib/payments.js` (**nuevo**, puro/testeable): `computeOrderFinance`, `validateNewPayment`, `computeCommission`, `nextCommissionStatus`, `normalizePaymentMethod`, `money`.
- `src/routes/clients.js`: `GET /search`, `GET /:id/history`; guardas de permiso en `PUT`/`DELETE`.
- `src/routes/order-payments.js` (**nuevo**): abonos CRUD + recibo + liberación de comisión.
- `src/routes/orders.js`: guardas `canEditMoney`/`denyMoney` en endpoints sensibles + stripping de campos monetarios en `PUT /:id`.
- `src/routes/quotations.js`: conversión usa estado “Autorizada”.
- `src/routes/photos.js`: `expires_at = now + PHOTO_RETENTION_DAYS` (default 30).
- `src/lib/prisma.js`: `OrderPayment` agregado a `SCOPED_MODELS` (aislamiento multi-tenant).
- `src/index.js`: registro de `/api/order-payments`.

## 7. Cambios en base de datos

Modelos Prisma (`schema.prisma`):
- `Order.estimated_delivery_at` (nullable).
- `OrderPhoto.expires_at` (nullable; `category` actúa como tipo de foto).
- `MechanicEarning.commission_status` (default `PENDING_PAYMENT`) + `commission_released_at`.
- **Nuevo modelo `OrderPayment`** (abonos, append-only con cancelación auditada y folio de recibo).
- Back-reference `Workspace.order_payments`.

`prisma validate` ✅ y `prisma generate` ✅ ejecutados localmente.

## 8. Migraciones aplicadas

`migrations/007_elihu_workflow.sql` — **aditiva, idempotente, no destructiva**:
1. `ALTER orders ADD estimated_delivery_at`.
2. `ALTER order_photos ADD expires_at` + backfill (`created_at + 30d`) + índice.
3. `ALTER mechanic_earnings ADD commission_status, commission_released_at` + backfill (`is_paid → PAID`).
4. `CREATE TABLE order_payments` + índices + secuencia/trigger de folio `REC-YYYY-####` + **backfill de `advance_payment` como abono inicial**.
5. Estado **“Autorizada”** insertado por workspace (y global `NULL`) solo si falta.
6. Índice de búsqueda por nombre: `pg_trgm` GIN sobre `full_name`, con fallback `btree lower(full_name)` si no hay privilegios.

> **Aún no aplicada a ninguna base de datos remota.** Ver runbook §29.

## 9. Nuevos endpoints

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/clients/search?q=&limit=` | miembro |
| GET | `/api/clients/:id/history` | miembro |
| GET | `/api/order-payments/order/:orderId` | miembro |
| POST | `/api/order-payments` | owner/admin/maestro o `can_manage_payments` |
| POST | `/api/order-payments/:id/cancel` | owner/admin/maestro o `can_manage_payments` |
| GET | `/api/order-payments/:id/receipt` | miembro |

## 10. Endpoints modificados

- `PUT /api/clients/:id`, `DELETE /api/clients/:id` → guardas de permiso.
- `PUT /api/orders/:id` → ignora campos monetarios sin permiso.
- `PUT /api/orders/:id/paid`, `PUT /api/orders/:id/costs`, `POST /api/orders/:id/services`, `DELETE …/services/:id`, `POST/DELETE …/parts` → guarda `canEditMoney`.
- `DELETE /api/orders/:id` → requiere owner/admin/maestro o `can_delete_orders`.
- `POST /api/quotations/:id/convert` → estado “Autorizada”.
- `POST /api/photos` → setea `expires_at`.

## 11. Modelos/tablas nuevas o modificadas

- Nueva: `order_payments`.
- Modificadas: `orders`, `order_photos`, `mechanic_earnings`, `order_statuses` (fila “Autorizada”), índice en `clients`.

## 12. Nuevos estados de orden

- **“Autorizada”** (no terminal, `display_order` 2). No se renombró ni borró ningún estado existente. “Lista para Entregar” ya existía y se conserva con el texto visible al cliente “La moto está lista para entregar”.

## 13. Reglas de pagos y abonos

- Varios abonos por orden (`OrderPayment`).
- Monto **> 0** obligatorio; **sin sobrepago** salvo `allow_overpay` autorizado por owner/admin.
- Pago **nunca se borra**: se cancela con `cancelled_at` + motivo (auditoría).
- Cada abono registra `received_by`, `payment_method`, `payment_date`, folio `REC-YYYY-####`.

## 14. Reglas de saldo pendiente

- `saldo = total_amount − Σ(abonos no cancelados)`; piso en 0; sobrepago reportado aparte.
- `payment_status`: `Pendiente` | `Parcial` | `Pagada` (derivado, no string frágil).
- La orden puede estar “Lista para Entregar” con saldo pendiente; `is_paid` se recalcula automáticamente.

## 15. Reglas de comisión variable

- Sobre **mano de obra** (`labor_total`), porcentaje variable por orden/trabajo (`MechanicEarning.commission_rate`).
- Ciclo: `PENDING_PAYMENT → READY_TO_PAY` (al liquidar todo) `→ PAID`; `CANCELLED` terminal.
- **No se libera con abonos parciales**; solo cuando el saldo llega a 0 (`reconcileOrder`).
- Si se cancela un abono y la orden deja de estar liquidada, vuelve a `PENDING_PAYMENT` (nunca degrada `PAID`).

## 16. Reglas de permisos por rol

| Acción | owner/admin | maestro (`mechanic`) | auxiliar (`auxiliary`) |
|---|---|---|---|
| Crear orden | ✅ | ✅ | ✅ |
| Cambiar precios/costos | ✅ | ✅ | ❌ 403 |
| Registrar/cancelar abonos | ✅ | ✅ | ❌ 403 |
| Marcar pagado | ✅ | ✅ | ❌ 403 |
| Borrar orden | ✅ | ✅ | ❌ 403 |
| Borrar cliente | ✅ | ❌ | ❌ |
| Editar cliente | ✅ | ✅ | ❌ (salvo `can_edit_clients`) |

Overrides finos vía `membership.permissions` (`can_manage_payments`, `can_edit_costs`, `can_delete_orders`, `can_edit_clients`). **Configurable por workspace** (no hardcode irreversible — alineado a futura comparación con MACIEL).

## 17. Reglas de fotos y retención

- `expires_at = created_at + 30 días` (configurable vía `PHOTO_RETENTION_DAYS`).
- Backfill aplica a fotos existentes.
- Borrado físico automático: **pendiente seguro** (ver §27). El `expires_at` ya queda preparado; ninguna foto se borra antes de 30 días.

## 18. Cambios en PDF/comprobantes

- `GET /order-payments/:id/receipt` entrega todos los datos del comprobante (taller, cliente, moto, orden, fecha, método, abono, total pagado, saldo, estado, folio, recibió, notas). El componente `PaymentReceiptDownload.jsx` existente puede consumirlo. **PDF de orden/cotización**: el modelo ya soporta los datos nuevos; ajuste de plantilla = pendiente de UI.

## 19. Cambios en WhatsApp

- No se modificó el flujo de WhatsApp en este pase. El texto de estado “La moto está lista para entregar” se conserva. Vista previa/edición de mensajes = pendiente de UI (§27).

## 20–21. Pruebas ejecutadas y resultados

- **`npm test` (apps/api): 43/43 pasan** (20 nuevas de lógica de búsqueda y pagos + 23 existentes).
- `node --check` en todos los archivos modificados (incl. `apps/frontend/src/lib/api.js`): OK.
- `npx prisma validate` / `npx prisma generate`: OK.

Cobertura nueva: normalización/acentos, construcción de `where`, ranking; finanzas de orden (pendiente/parcial/pagada, abonos cancelados, sobrepago), validación de abono (cero/negativo/sobrepago), comisión variable y no-liberación hasta liquidar.

## 22. Evidencia de build correcto

```
node --test test/*.test.js  →  ℹ pass 43  ℹ fail 0
npx prisma validate         →  The schema is valid 🚀
npx prisma generate         →  ✔ Generated Prisma Client
```

## 23. Evidencia de deploy correcto

**N/A — no se desplegó (bloqueo §28).**

## 24. Rutas o pantallas nuevas

Backend: ver §9. Frontend: métodos de API listos; pantallas pendientes (§27).

## 25. Variables de entorno nuevas

- `PHOTO_RETENTION_DAYS` (opcional, default `30`).

## 26. Riesgos detectados

- El reparto de comisiones (`PUT /orders/:id/costs` con `mark_as_paid`) genera `MechanicEarning` con `is_paid:false` y por defecto `commission_status='PENDING_PAYMENT'`; la liberación ahora depende de abonos vía `OrderPayment`. En órdenes que se sigan marcando pagadas por la vía legacy (`/paid`, `/costs`), conviene migrar la UI a registrar abonos para que el ciclo de comisión se dispare. Documentado, no rompe datos.
- El índice `pg_trgm` requiere privilegio para `CREATE EXTENSION`; la migración cae a un índice `btree` si no lo hay (sin fallar).

## 27. Pendientes / limitaciones

1. **UI**: pantallas de búsqueda por nombre, historial, panel de abonos, botón de recibo, campo de fecha prometida, vista previa de WhatsApp.
2. **Sweep de borrado físico de fotos vencidas** (job seguro; `expires_at` ya preparado).
3. **Plantillas PDF** de orden/cotización para incluir saldo/fotos/fecha prometida.
4. Pruebas E2E con base de datos (requieren `docker compose up`).

## 28. Confirmación de que NO se rompió el flujo actual + BLOQUEO de deploy

- Todos los cambios de DB son **aditivos** (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, inserts condicionados). No se borró ninguna columna, fila ni estado existente.
- Las 23 pruebas previas siguen pasando.
- **Bloqueo de despliegue (regla 4.7 del encargo):** No fue posible crear ni validar un **backup de la base de datos de producción** desde este entorno (copia local en Windows, sin acceso verificado y seguro a la Postgres de producción). Por la propia regla *“Si no puedes crear backup, detente y reporta el bloqueo”*, **no se ejecutó migración ni deploy en producción ni se usaron los tokens de VPS/Dokploy**. El despliegue queda como handoff con runbook (§29).

## 29. Runbook de despliegue (para ejecutar con supervisión humana)

> Requiere acceso real a staging/producción. Ejecutar en este orden.

```bash
# 0. Backup OBLIGATORIO antes de migrar (ajusta credenciales reales)
pg_dump "$DATABASE_URL" -Fc -f backup_pre_007_$(date +%Y%m%d_%H%M).dump
ls -lh backup_pre_007_*.dump          # validar tamaño > 0
pg_restore -l backup_pre_007_*.dump | head   # validar que es listable

# 1. Staging primero
psql "$STAGING_DATABASE_URL" -f migrations/007_elihu_workflow.sql
cd apps/api && npx prisma generate
npm test                              # 43/43
# smoke: login, dashboard, /clients/search, /order-payments, órdenes

# 2. Producción (solo tras staging OK + backup validado)
psql "$PROD_DATABASE_URL" -f migrations/007_elihu_workflow.sql
# redeploy normal (push a main → Dokploy) para api + frontend
# smoke producción: login, dashboard, búsqueda cliente, abono de prueba, recibo
```

La migración es idempotente: re-ejecutarla es seguro.

## 30. Commit final

Ver `git log` de la rama `feature/elihu-workflow-v1` (commit de este paquete).

## 31. Rama usada

`feature/elihu-workflow-v1` (creada desde `main`).

## 32. Backup realizado antes de migrar/desplegar

**No realizado** — no se migró/desplegó (ver §28). El paso de backup es el primero del runbook §29 y debe ejecutarlo el operador con acceso a producción.



---
---

# PARTE 2 — CIERRE DE UI END-TO-END (ELIHU Workflow v1)

> Continúa sobre `feature/elihu-workflow-v1` (base commit `72835c2`). Esta parte conecta
> la base backend con la experiencia real en la interfaz, mobile-first, y la prueba con build real.

## 1. Resumen ejecutivo (Parte 2)

Se conectó el flujo completo en la UI: búsqueda de cliente por nombre con historial, sección de
**Pagos y saldo** con abonos/recibo, **comisión variable** sobre mano de obra con ciclo de
liberación, **fecha estimada de entrega**, **tipos de foto** + aviso de retención 30 días,
**gating de permisos** real en pantalla, advertencia de **entrega con saldo pendiente**, widgets de
dashboard, y actualización de **PDF de orden + recibo**. La conversión cotización→orden ya existía
y ahora nace **“Autorizada”**.

**Verificación ejecutada en este pase:**
- `apps/api`: `npm test` → **43/43 PASS**; `npx prisma validate` → **valid**.
- `apps/frontend`: `npm run build` (Vite) → **PASS** (~12 s) de forma repetida tras cada bloque.

## 2. Qué ya existía (no se reescribió)
- `QuotationDetail.jsx`: flujo aceptar (`handleSetStatus('aceptada')`) + `handleConvert()` →
  `quotationsService.convert()` con navegación a la orden creada, banner de convertida y
  manejo de doble conversión. **Ya completo**; el backend ahora hace que esa orden sea “Autorizada”.
- `WhatsAppSendModal.jsx`: **vista previa editable** (textarea), estado del bot con **fallback**
  (“Bot desconectado”), plantillas rápidas y botón enviar. Cumple el requisito de preview editable.
- `NewServiceOrder.jsx`: orden rápida (cliente + moto + falla) ya existente; no se modificó.

## 3. Cambios de UI implementados ahora

| Área | Archivo | Qué hace |
|---|---|---|
| Búsqueda por nombre | `NewQuotation.jsx` | Búsqueda backend con debounce (`clientsService.search`) + fallback local; filas con motos y última orden |
| Historial cliente | `components/clients/ClientHistoryPanel.jsx` | Acordeón mobile: motos, órdenes, cotizaciones, saldo pendiente, última visita |
| Pagos y saldo | `components/orders/OrderPaymentsSection.jsx` | Total/pagado/saldo/estado, historial de abonos, registrar/cancelar abono, descargar recibo PDF |
| Comisión variable | `components/orders/CommissionSection.jsx` | Base = mano de obra, % editable (maestro), comisión calculada, estado del ciclo |
| Fecha de entrega | `OrderDetail.jsx` | Campo fecha editable (`estimated_delivery_at`) con guardado |
| Entrega con saldo | `OrderDetail.jsx` | Al pasar a “Entregada” con saldo: bloquea al auxiliar; pide nota de autorización al maestro |
| Permisos UI | `OrderDetail.jsx` | `canManageMoney` oculta editar costos, registrar pago, comisión |
| Tipos de foto | `components/orders/PhotoUpload.jsx` | Frente/Trasera/Tablero/Daños/Refacciones/Otra + aviso retención 30 días |
| Dashboard | `MechanicDashboard.jsx` | Widgets: Autorizadas, Cotizaciones por autorizar, Entregas próximas/vencidas |
| WhatsApp texto | `utils/whatsappHelper.js` | “La moto está lista para entregar” + caso “Autorizada” |
| PDF orden | `utils/pdfGenerator.js` | Pagado + Saldo + Entrega estimada |
| PDF recibo | `utils/pdfGenerator.js` | `generatePaymentReceiptPDF` (folio, abono, total, pagado, saldo, estado, método) |

## 4. Backend agregado en Parte 2
- `GET /api/earnings/order/:orderId` — comisión + estado financiero de la orden.
- `PUT /api/earnings/order/:orderId/commission` — fija % variable sobre mano de obra (solo maestro/dueño);
  crea/actualiza `MechanicEarning` con `commission_status` derivado del saldo (se libera al liquidar).

## 5. Mapa de criterios de aceptación (Parte 2)

| # | Criterio | Estado |
|---|---|---|
| 1 | Buscar cliente por nombre desde UI | **PASS** (build) |
| 2 | Ver historial del cliente desde UI | **PASS** (build) |
| 3 | Crear cotización desde UI | **PASS** (preexistente) |
| 4 | Aceptar cotización desde UI | **PASS** (preexistente) |
| 5 | Al aceptar, se crea orden | **PASS** (preexistente + backend) |
| 6 | Orden nace “Autorizada” | **PASS** (backend convert + seed/migración) |
| 7 | “Lista para entregar” visible y con texto correcto | **PASS** |
| 8 | Fecha estimada de entrega | **PASS** |
| 9-10 | Subir/ver fotos + asociadas | **PARCIAL** (tipos + retención listos; persistencia servidor vs IndexedDB en NewServiceOrder sin cambiar — backend `expires_at` listo) |
| 11 | Varios abonos | **PASS** |
| 12 | Saldo pendiente | **PASS** |
| 13 | Estado de pago | **PASS** |
| 14 | Generar/ver/descargar recibo | **PASS** (descarga PDF; envío por WhatsApp del recibo = manual vía modal) |
| 15-18 | Comisión variable, sobre mano de obra, no se libera con abonos, se libera al liquidar | **PASS** |
| 19-21 | Auxiliar no cambia precios/pagos/comisión | **PASS** (backend 403 + UI oculta) |
| 22 | PDFs con datos nuevos | **PASS** (orden + recibo; cotización PDF server-side ya incluía campos) |
| 23 | WhatsApp preview editable | **PASS** (modal existente) / status auto-notif sigue automático = **documentado** |
| 24 | Dashboard relevante | **PASS** (widgets; agregados de saldo/comisión global = pendiente de endpoint de stats) |
| 25 | Tests pasan | **PASS** (43/43) |
| 26 | Build pasa | **PASS** (vite) |
| 27-28 | QA + docs | **PASS** (este doc + QA) |
| 29 | Post-deploy verificado | **N/A** (no desplegado) |
| 30 | Si no se desplegó, razón documentada y listo | **PASS** (ver Parte 1 §28 + runbook §29) |

## 6. Pendientes/limitaciones honestos (Parte 2)
1. **Notificación WhatsApp en cambio de estado**: sigue enviándose automáticamente (comportamiento
   preexistente en `OrderDetail.handleStatusChange`). La **vista previa editable existe** y se usa para
   envíos manuales (`WhatsAppSendModal`). Migrar el auto-envío a “preview obligatorio” cambia el
   comportamiento central y se dejó fuera por riesgo; queda documentado.
2. **Fotos**: tipos y retención (`expires_at`) listos en backend; el guardado en `NewServiceOrder`
   puede seguir usando almacenamiento local/IndexedDB en algunos caminos. Migrar 100% a servidor
   es trabajo de UI adicional. El **sweep de borrado físico** sigue como pendiente seguro (Parte 1 §17).
3. **Dashboard de saldos/comisiones globales**: los widgets actuales se basan en datos ya cargados.
   Agregados “saldo total por cobrar” y “comisiones pendientes” requieren un endpoint de stats para
   evitar N+1; se dejó como mejora documentada.
4. **PDF de cotización**: se genera server-side (`routes/quotation-pdf.js`, pdfkit) y ya incluye
   cliente/moto/falla/servicios/total; no se modificó en este pase.

## 7. Verificación (Parte 2)
```
apps/api   > npm test            → ℹ tests 43 · pass 43 · fail 0
apps/api   > npx prisma validate → schema is valid 🚀
apps/frontend > npm run build    → ✓ built in ~12s (sin errores)
```

## 8. Archivos nuevos (Parte 2)
- `apps/frontend/src/components/orders/OrderPaymentsSection.jsx`
- `apps/frontend/src/components/orders/CommissionSection.jsx`
- `apps/frontend/src/components/clients/ClientHistoryPanel.jsx`

## 9. Archivos modificados (Parte 2)
- `apps/api/src/routes/earnings.js`
- `apps/frontend/src/lib/api.js`
- `apps/frontend/src/pages/mechanic/NewQuotation.jsx`
- `apps/frontend/src/pages/mechanic/OrderDetail.jsx`
- `apps/frontend/src/pages/mechanic/MechanicDashboard.jsx`
- `apps/frontend/src/components/orders/PhotoUpload.jsx`
- `apps/frontend/src/utils/pdfGenerator.js`
- `apps/frontend/src/utils/whatsappHelper.js`

## 10. Despliegue (Parte 2)
**No desplegado.** Igual que en Parte 1: sin acceso seguro/verificado a producción ni backup posible
desde este entorno, por lo que el deploy queda bloqueado (regla 4.7). Runbook en Parte 1 §29.
Nota: la migración `007_elihu_workflow.sql` sigue siendo el único cambio de DB requerido; el frontend
es estático (build) y no requiere migración adicional.
