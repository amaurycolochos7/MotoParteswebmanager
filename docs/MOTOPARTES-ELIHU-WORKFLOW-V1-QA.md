# MotoPartes — ELIHU Workflow v1 — QA (PASS / FAIL / BLOCKED)

> Rama: `feature/elihu-workflow-v1`. Verificado en local (Node 24) y contra **PostgreSQL 16 real**
> (`docker-compose.local.yml`, `:5434`) vía test de integración in-process `apps/api/test/_elihu_e2e.mjs`.
>
> Leyenda: **PASS** = verificado (unit test, build, o E2E contra DB real). **BLOCKED** = requiere acceso
> a staging/producción que no existe en este entorno. **DOC** = decisión documentada.

## A. Unitarias (verificado, `npm test` → 43/43)
Búsqueda (normalize/where/match/rank), finanzas (Pendiente/Parcial/Pagada, cancelados, sobrepago),
validación de abono, comisión variable, no-liberación hasta liquidar, terminales. **Todas PASS.**

## B. Build / esquema (verificado)
`prisma validate` PASS · `prisma generate` PASS · `vite build` PASS · `node --check` rutas PASS.

## C. Migración 007 en DB real (verificado — Parte 3)
| Caso | Estado |
|---|---|
| Migración aplica sin error sobre esquema previo con datos | **PASS** |
| Estado “Autorizada” creado | **PASS** |
| Orden / cliente / cotización existentes sobreviven | **PASS** |
| `advance_payment` backfilled a `order_payments` | **PASS** |
| Prisma Client opera contra la DB migrada | **PASS** |

## D. E2E backend en DB real (verificado — `_elihu_e2e.mjs`, 36/36)
| Caso | Estado |
|---|---|
| Crear cliente | **PASS** |
| Buscar cliente por nombre (acento/parcial) | **PASS** |
| Historial del cliente | **PASS** |
| Crear cotización | **PASS** |
| Convertir cotización → orden | **PASS** |
| Evitar doble conversión | **PASS** |
| Orden nace “Autorizada” | **PASS** |
| Fijar costos (mano de obra) | **PASS** |
| Fecha estimada de entrega | **PASS** |
| Comisión 30% = 150 sobre mano de obra | **PASS** |
| Comisión inicia PENDING_PAYMENT | **PASS** |
| Primer abono → saldo parcial | **PASS** |
| Comisión NO se libera con abono parcial | **PASS** |
| Bloquear sobrepago / monto 0 | **PASS** |
| Pago final → saldo 0 / Pagada | **PASS** |
| Comisión READY_TO_PAY al liquidar | **PASS** |
| Recibo con folio REC- | **PASS** |
| Estado “Lista para Entregar” | **PASS** |
| Entrega con saldo: AUX → 403 (backend) | **PASS** |
| Entrega con saldo: MASTER sin nota → 400 (backend) | **PASS** |
| Entrega con saldo: MASTER con nota → 200 (backend) | **PASS** |
| Nota de autorización registrada en historial | **PASS** |
| Entregar orden sin saldo → 200 normal | **PASS** |

## E. Permisos en DB real (verificado — `_elihu_e2e.mjs`)
| Caso | Estado |
|---|---|
| AUX 403: registrar pago | **PASS** |
| AUX 403: cambiar costos | **PASS** |
| AUX 403: marcar pagada | **PASS** |
| AUX 403: cambiar comisión | **PASS** |
| AUX 403: borrar orden | **PASS** |
| AUX 403: borrar cliente | **PASS** |
| AUX: crear cliente (permitido) | **PASS** |
| AUX: `total_amount` vía PUT genérico ignorado | **PASS** |
| MASTER: cambiar comisión | **PASS** |

## F. UI (compila; verificación visual en navegador pendiente de despliegue)
Buscador por nombre + historial en cotización, sección Pagos y saldo, comisión, fecha de entrega,
advertencia de entrega con saldo, gating de botones de dinero, tipos de foto, dashboard, recibo PDF.
**Build PASS**; la verificación visual con navegador requiere el frontend desplegado (ver H).

## G. Decisiones documentadas (DOC)
| Tema | Decisión |
|---|---|
| Fotos | **Opción B**: backend `expires_at` listo; flujo de captura sigue en IndexedDB; **UI ya no promete servidor**; migración server-side fuera del release |
| WhatsApp | **Opción B**: auto-notif en cambio de estado se conserva; preview editable manual vía `WhatsAppSendModal`; lista de mensajes automáticos en REPORT Parte 3 §7 |
| Dashboard | **Opción B**: widgets sin N+1 implementados; agregados globales saldo/comisión fuera del release (requieren endpoint de stats) |
| Entrega con saldo | **Backend + UI**: `PUT /orders/:id/status` valida — auxiliar 403, maestro requiere nota (400 sin nota), nota guardada en historial; UI también bloquea/pide nota. Verificado en E2E (sección D) |

## H. Despliegue / Backup
| Caso | Estado |
|---|---|
| Push de la rama | **PASS** (origin) |
| Crear PR vía `gh` | **BLOCKED** (token `gh` 401; abrir manual con la URL — REPORT Parte 3 §2) |
| Staging del proyecto | **BLOCKED** (no existe/accesible; se usó Postgres local real como sustituto) |
| Backup producción | **BLOCKED** (sin acceso seguro; regla 4.7) |
| Deploy producción + smoke tests | **BLOCKED** (depende de backup/acceso) |
| Runbook de despliegue | **PASS** (REPORT Parte 1 §29) |
| Verificación visual en navegador | **BLOCKED** (requiere frontend desplegado) |
