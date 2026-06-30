# MotoPartes — QA: Evidencias del servicio

Suite: `apps/api/test/evidences.test.js` — runner nativo `node --test`, sin DB
ni frameworks (ejercita la lógica pura de `apps/api/src/lib/evidences.js`, que es
exactamente lo que las rutas usan para decidir permisos y transformaciones).

Comando: `cd apps/api && npm test`
Resultado global: **60/60 PASS** (16 de este módulo + 44 preexistentes).

---

## Cobertura de los 14 escenarios requeridos

| # | Escenario | Resultado esperado | Prueba | Estado |
|---|---|---|---|---|
| 1 | Maestro sube evidencia | PASS | `#1 maestro puede subir evidencia → PASS` (`canUploadEvidence('master')===true`) | ✅ PASS |
| 2 | Mecánico normal sube evidencia | PASS | `#2 mecánico normal puede subir evidencia → PASS` | ✅ PASS |
| 3 | Auxiliar sube evidencia | 403 | `#3 auxiliar NO puede subir evidencia → 403` (por rol y por `requires_approval`) | ✅ PASS |
| 4 | Maestro envía por WhatsApp | PASS / mock | `#4 maestro puede enviar… → PASS` (`canSendEvidence('master')`, `parseDataUrl`, `sentPatch`) | ✅ PASS |
| 5 | Mecánico normal intenta enviar | 403 | `#5 mecánico normal NO puede enviar → 403` | ✅ PASS |
| 6 | Auxiliar intenta enviar | 403 | `#6 auxiliar NO puede enviar → 403` | ✅ PASS |
| 7 | Maestro elimina | soft delete PASS | `#7 maestro elimina → soft delete` (queda `deleted_at`+`deleted_by`, deja de ser visible, la fila persiste) | ✅ PASS |
| 8 | Mecánico normal elimina | 403 | `#8 mecánico normal NO puede eliminar → 403` | ✅ PASS |
| 9 | Evidencia aparece en listado de orden | visible | `#9 evidencia activa aparece en el listado` (`filterVisibleEvidences` ignora no-evidencias y eliminadas) | ✅ PASS |
| 10 | Evidencia aparece en comprobante/PDF | visible | `#10 evidencia activa aparece en el PDF` (`filterEvidencesForPdf`) | ✅ PASS |
| 11 | Crear cotización adicional desde evidencia | PASS | `#11 …permisos + payload` y `#11b exige cliente` (`buildAdditionalQuotePayload`: `order_id`, `is_additional`, totales) | ✅ PASS |
| 12 | Cliente autoriza trabajo extra | PASS | `#12 cliente autoriza/rechaza` (`applyClientAuthorization` → status + `client_authorized_at`) | ✅ PASS |
| 13 | Evidencia eliminada NO aparece en PDF | excluida | `#13 evidencia eliminada NO aparece en el PDF` | ✅ PASS |
| 14 | Evidencia expira a 30 días | expira | `#14 evidencia expira a 30 días` (`computeEvidenceExpiry`/`isExpired` antes y después) | ✅ PASS |

Pruebas de apoyo adicionales:
- `resolveEvidenceRole clasifica master/mechanic/auxiliary por ambas señales`
- `tipos de evidencia válidos son exactamente los 3 requeridos`

---

## Salida resumida

```
✔ #1 maestro puede subir evidencia → PASS
✔ #2 mecánico normal puede subir evidencia → PASS
✔ #3 auxiliar NO puede subir evidencia → 403
✔ #4 maestro puede enviar evidencia por WhatsApp → PASS
✔ #5 mecánico normal NO puede enviar → 403
✔ #6 auxiliar NO puede enviar → 403
✔ #7 maestro elimina → soft delete (auditado), no borrado físico
✔ #8 mecánico normal NO puede eliminar → 403
✔ #9 evidencia activa aparece en el listado de la orden
✔ #10 evidencia activa aparece en el PDF
✔ #11 cotización adicional desde evidencia: permisos + payload
✔ #11b buildAdditionalQuotePayload exige cliente en la orden
✔ #12 cliente autoriza/rechaza el trabajo extra
✔ #13 evidencia eliminada (soft delete) NO aparece en el PDF
✔ #14 evidencia expira a 30 días
ℹ tests 60   ℹ pass 60   ℹ fail 0
```

---

## Otras verificaciones

| Verificación | Comando | Resultado |
|---|---|---|
| Schema Prisma válido | `npx prisma validate` | ✅ válido |
| Cliente Prisma regenerado | `npx prisma generate` | ✅ OK (v6.19.3) |
| Sintaxis backend | `node --check` en rutas/lib modificadas | ✅ sin errores |
| Build frontend | `npm run build` (apps/frontend) | ✅ exitoso (sólo warnings de tamaño de chunk preexistentes) |

---

## Validación operativa contra PostgreSQL real

DB usada: contenedor `postgres:16-alpine` (compose, host `127.0.0.1:5434`), con
datos preexistentes (3 workspaces, 5 órdenes, 5 cotizaciones).

### Migración 008 (PostgreSQL real)

| Validación | Resultado |
|---|---|
| Corre sin error | ✅ |
| Idempotente (2ª corrida) | ✅ NOTICE "already exists, skipping", sin error |
| Sin pérdida de datos | ✅ hash de ids `orders`/`quotations` idéntico antes/después; counts 5/5 |
| 7 columnas en `order_photos` | ✅ evidence_type, deleted_at, deleted_by, delete_reason, sent_to_client_at, sent_by, quotation_id |
| 3 columnas en `quotations` | ✅ order_id, is_additional, client_authorized_at |
| 3 índices | ✅ |
| 2 FKs | ✅ |
| Prisma opera tras migrar | ✅ (E2E hace CRUD real) |

### E2E real — `node test-evidences-e2e.mjs` → **19/19 PASS**

```
PASS Seed: workspace, maestro, normal, auxiliar, cliente, moto, orden creados
PASS 08 Maestro sube evidencia pieza_danada → 201
PASS 09 Mecánico normal sube pieza_nueva → 201
PASS 10 Auxiliar sube evidencia → 403
PASS 11 Listar evidencias activas → 2
PASS 22 Expiración a 30 días (expires_at = created_at + 30d)
PASS 12 Maestro envía evidencias por WhatsApp (mock) → success, sent=2
PASS 12b sent_to_client_at + sent_by registrados
PASS 13 Mecánico normal envía → 403
PASS 14 Auxiliar envía → 403
PASS 15 Maestro crea cotización adicional desde evidencia → 201 (is_additional, total=600)
PASS 16a Portal público lista trabajo extra
PASS 16b Cliente autoriza trabajo extra → aceptada + client_authorized_at
PASS 17 Comprobante PDF generado con evidencias (bytes=3295)
PASS 18 Mecánico normal elimina → 403
PASS 19 Maestro elimina (soft delete) → success
PASS 20 Evidencia eliminada NO aparece en listado
PASS 21 Auditoría de eliminación registrada (deleted_at/by/reason), fila persiste
PASS 20b PDF se regenera tras eliminación (evidencias activas filtradas, bytes=3240)
=== RESULTADO E2E: 19 PASS / 0 FAIL ===
```

Mapeo a los 22 pasos pedidos: 1-7 = Seed; 8/9/10 = subir maestro/normal/auxiliar;
11 = listar; 12 = enviar WhatsApp (mock); 13/14 = enviar normal/aux 403; 15 =
cotización adicional; 16 = autorización cliente (16a/16b); 17 = PDF con
evidencias; 18/19 = eliminar normal 403 / maestro soft delete; 20 = no aparece en
listado; 20b = no aparece en PDF; 21 = auditoría; 22 = expiración 30 días.

### PDF real

PDF válido (`%PDF-`, 3295 bytes con 2 evidencias). Tras soft delete de una
evidencia, el PDF se regenera a 3240 bytes → confirma exclusión de eliminadas.

### WhatsApp

Mock integrado: `success:true, sent:2`, `sent_to_client_at`/`sent_by` marcados.
Fallback (bot caído) implementado: `success:false, fallback:true`, sin romper la
orden, UI muestra estado real.

### Revisión visual mobile/desktop → **NEEDS_REVIEW**

No hay navegador en este entorno. Frontend compila y el componente se monta;
revisión visual a 360px/desktop pendiente de validación manual.

---

## Qué NO cubre todavía (límites honestos)

- **Deploy a producción: NO ejecutado** (bloqueo de seguridad; requiere
  confirmación + backup). Runbook en el reporte.
- Envío WhatsApp **real** a número de prueba (validado con mock).
- Revisión visual manual (NEEDS_REVIEW).
