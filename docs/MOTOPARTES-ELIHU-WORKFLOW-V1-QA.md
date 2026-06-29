# MotoPartes — ELIHU Workflow v1 — QA (PASS / FAIL / BLOCKED)

> Rama: `feature/elihu-workflow-v1`. Build/test ejecutados en local (Windows, Node 24).
> Leyenda:
> **PASS** = verificado en local (unit test o build). **PASS(UI)** = compila y la ruta de datos
> está conectada; falta verificación visual en runtime con datos reales. **BLOCKED** = no verificable
> en este entorno (requiere DB en vivo / staging / producción). **DOC** = decisión documentada.

## A. Automatizado (verificado, `npm test` 43/43)

| Caso | Estado |
|---|---|
| normalize quita acentos / minúsculas | PASS |
| búsqueda nombre parcial / teléfono / placas | PASS |
| `buildClientSearchWhere` corta < 2 chars, sin cláusula tel vacía | PASS |
| ranking exacto > prefijo > contiene > teléfono | PASS |
| finanzas Pendiente/Parcial/Pagada, ignora cancelados, sobrepago | PASS |
| `validateNewPayment` bloquea 0/negativo/NaN/sobrepago | PASS |
| comisión sobre mano de obra, % variable | PASS |
| comisión NO se libera con abono parcial; READY_TO_PAY al liquidar | PASS |
| `PAID`/`CANCELLED` terminales; cancelar orden cancela comisión | PASS |

## B. Build / esquema (verificado)

| Caso | Estado |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS |
| `vite build` (frontend) tras cada bloque de cambios | PASS |
| `node --check` rutas backend modificadas | PASS |

## C. Backend funcional (requiere DB en vivo)

| Caso | Estado |
|---|---|
| `GET /clients/search?q=` por nombre/acento/teléfono/placas | BLOCKED (lógica PASS por unit test) |
| `GET /clients/:id/history` | BLOCKED |
| `POST /order-payments` válido / 0 / negativo / sobrepago | BLOCKED (lógica PASS) |
| liquidar → `payment_status: Pagada`, `is_paid` | BLOCKED (lógica PASS) |
| comisión → `READY_TO_PAY` al liquidar | BLOCKED (lógica PASS) |
| `POST /order-payments/:id/cancel` (no borra, recalcula) | BLOCKED (lógica PASS) |
| `GET /order-payments/:id/receipt` (folio, saldo) | BLOCKED |
| `PUT /earnings/order/:id/commission` (solo maestro) | BLOCKED |
| Auxiliar 403 en paid/costs/parts/delete/commission | BLOCKED (código verificado por lectura) |
| `convert` → orden “Autorizada” | BLOCKED (código verificado; requiere migración 007 aplicada) |

## D. UI / móvil (compila; verificación visual pendiente en runtime)

| Caso | Estado |
|---|---|
| Buscador de cliente por nombre en cotización | PASS(UI) |
| Resultados muestran motos + última orden | PASS(UI) |
| Panel de historial del cliente (acordeón) | PASS(UI) |
| Sección Pagos y saldo en detalle de orden | PASS(UI) |
| Registrar abono / método / nota | PASS(UI) |
| Ver saldo + estado de pago | PASS(UI) |
| Cancelar abono con motivo | PASS(UI) |
| Descargar recibo PDF (folio) | PASS(UI) |
| Comisión variable: base/%, cálculo, estado (maestro) | PASS(UI) |
| Campo fecha estimada de entrega | PASS(UI) |
| Advertencia entrega con saldo + nota de autorización | PASS(UI) |
| Botones de dinero ocultos para auxiliar | PASS(UI) |
| Tipos de foto ELIHU + aviso 30 días | PASS(UI) |
| Dashboard: Autorizadas / Por autorizar / Entregas próximas | PASS(UI) |
| Estado “Lista para entregar” en modal de estado | PASS(UI) |

## E. Flujo E2E completo (manual, requiere staging)

| Paso | Estado |
|---|---|
| 1 Crear cliente + 2 moto | BLOCKED |
| 3 Cotización (falla/diagnóstico/mano de obra/refacciones) | BLOCKED |
| 4-6 Aceptar → convertir → orden Autorizada | BLOCKED |
| 7 Comisión 30% | BLOCKED |
| 8-10 Primer abono, saldo > 0, comisión NO liberada | BLOCKED |
| 11-13 Pago final, saldo 0, comisión READY_TO_PAY | BLOCKED |
| 14 “Lista para entregar” | BLOCKED |
| 15-16 Recibo + PDF orden con total/pagado/saldo | BLOCKED |
| 17 Sin errores consola/backend | BLOCKED |

## F. Permisos (manual, requiere staging)

| Como auxiliar (espera 403/bloqueo) | Estado |
|---|---|
| Cambiar precio / costos | BLOCKED (backend 403 implementado) |
| Registrar / editar / cancelar pago | BLOCKED (backend 403 implementado) |
| Marcar pagada | BLOCKED (backend 403 implementado) |
| Cambiar comisión | BLOCKED (backend 403 implementado) |
| Borrar orden / cliente | BLOCKED (backend 403 implementado) |
| Crear orden (permitido) | BLOCKED |

## G. Decisiones documentadas (DOC)

| Tema | Estado |
|---|---|
| WhatsApp: preview editable existe (WhatsAppSendModal); auto-notif de cambio de estado sigue automática | DOC |
| Fotos: tipos + `expires_at` listos; persistencia 100% servidor en NewServiceOrder y sweep de borrado | DOC (pendiente seguro) |
| PDF cotización server-side (pdfkit) ya incluía campos; no modificado | DOC |
| Dashboard agregados saldo/comisión global requieren endpoint de stats | DOC |

## H. Despliegue / Backup

| Caso | Estado |
|---|---|
| Backup producción | BLOCKED (sin acceso seguro; regla 4.7) |
| Deploy staging/prod | BLOCKED (depende de backup) |
| Smoke tests post-deploy | BLOCKED |
| Runbook de despliegue entregado | PASS (REPORT §29) |
