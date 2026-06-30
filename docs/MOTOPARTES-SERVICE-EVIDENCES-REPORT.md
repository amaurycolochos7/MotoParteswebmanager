# MotoPartes — Reporte de implementación: Evidencias del servicio

Módulo que permite al taller documentar fotográficamente el estado de las piezas
y el trabajo realizado, enviar esas evidencias al cliente por WhatsApp, cotizar
trabajo extra a partir de una evidencia, y que el cliente autorice ese trabajo
desde su enlace de seguimiento.

---

## 1. Qué ya existía (y se reutilizó)

La investigación previa confirmó que **no hacía falta una tabla nueva**. Se
reutilizó la infraestructura existente:

| Pieza existente | Reutilización |
|---|---|
| Tabla `order_photos` (`OrderPhoto`) | Base de las evidencias. Ya tenía `order_id`, `url` (imagen como **data URL base64 guardada en el servidor**, persistente y multi-dispositivo), `category`, `caption`, `uploaded_by`, `expires_at` (retención 30 días), scoping multi-tenant y se incluye en los queries de orden. |
| Retención 30 días (`expires_at` + sweep migración 007) | Reutilizada tal cual para la regla "las evidencias se guardan 30 días". |
| Bot de WhatsApp (`/send-document` con base64+mimetype) | Mismo canal que usa el envío de PDF de orden; se reutiliza para enviar imágenes (mimetype `image/jpeg`). |
| Flujo de cotizaciones (`Quotation` + `QuotationLabor` + `QuotationPart`, folio `COT-YY-NNNN`, totales) | Reutilizado para la cotización adicional; sólo se le agregaron 3 campos. |
| Portal público de orden (`GET /api/orders/public/:token`, `ClientPortal.jsx`) | Reutilizado como punto de autorización del cliente. |
| Patrón de permisos (`request.workspaceRole` + `workspacePermissions` + banderas `Profile.is_master_mechanic`/`requires_approval`) | Reutilizado para clasificar maestro / normal / auxiliar. |
| Patrón de pruebas (`node --test`, funciones puras en `lib/`) | Reutilizado: la lógica del módulo vive en `lib/evidences.js` y se prueba sin DB. |

**Aclaración sobre almacenamiento:** existía un servicio IndexedDB local
(`photoStorageService.js` / `OrderPhotosDownload.jsx`) que guarda fotos **solo en
ese navegador** — es un camino legacy de descarga local. Las evidencias del
nuevo módulo **se guardan en el servidor** (`order_photos.url`), por lo que son
persistentes y visibles desde cualquier dispositivo. La sección de descarga
local se conservó intacta; el nuevo módulo es independiente.

---

## 2. Qué se agregó

### Tablas / campos (migración `migrations/008_service_evidences.sql`, additiva e idempotente)

`order_photos` (una fila es "evidencia" cuando `evidence_type IS NOT NULL`):
- `evidence_type TEXT` — `pieza_danada` | `pieza_nueva` | `despues_trabajo`
- `deleted_at TIMESTAMPTZ` — soft delete (regla 6: auditado, nunca borrado físico)
- `deleted_by UUID` — quién eliminó
- `delete_reason TEXT` — motivo opcional de eliminación (regla 4)
- `sent_to_client_at TIMESTAMPTZ` — cuándo se envió al cliente
- `sent_by UUID` — quién envió
- `quotation_id UUID` — cotización adicional creada desde esta evidencia (FK `ON DELETE SET NULL`)
- Índices: `idx_order_photos_evidence`, `idx_order_photos_quotation`

`quotations`:
- `order_id UUID` — orden origen del trabajo extra (FK `ON DELETE SET NULL`)
- `is_additional BOOLEAN DEFAULT FALSE` — marca cotización de trabajo extra
- `client_authorized_at TIMESTAMPTZ` — momento de autorización del cliente
- Índice: `idx_quotations_order`

`schema.prisma` se actualizó en paralelo (relaciones `OrderPhoto.quotation` ↔
`Quotation.evidence_photos`, `Quotation.order` ↔ `Order.additional_quotations`).
`prisma validate` y `prisma generate` corren OK (v6.19.3).

### Lógica pura — `apps/api/src/lib/evidences.js`

Permisos y transformaciones, todo testeable sin DB: `resolveEvidenceRole`,
`canUploadEvidence`, `canSendEvidence`, `canDeleteEvidence`,
`canCreateAdditionalQuote`, `filterVisibleEvidences`, `filterEvidencesForPdf`,
`computeEvidenceExpiry`, `isExpired`, `softDeletePatch`, `sentPatch`,
`computeQuoteTotals`, `buildAdditionalQuotePayload`, `applyClientAuthorization`,
`parseDataUrl`.

### Endpoints

Autenticados (`/api/evidences`, `routes/evidences.js`):

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/evidences?orderId=` | cualquier miembro que ve la orden | Lista evidencias activas (no eliminadas) con quién subió. |
| POST | `/api/evidences` | maestro + mecánico normal (auxiliar → 403) | Sube evidencia (tipo + nota opcional), fija `expires_at` a 30 días. |
| DELETE | `/api/evidences/:id` | sólo maestro | Soft delete (`deleted_at` + `deleted_by` + `delete_reason` opcional). |
| POST | `/api/evidences/send` | sólo maestro | Envía evidencias seleccionadas por WhatsApp (mensaje editable), marca `sent_to_client_at`. |
| POST | `/api/evidences/:id/quote` | maestro (o mecánico con `can_create_quotes`) | Crea cotización adicional ligada a la evidencia + orden. |

Públicos (sin auth, `routes/orders.js`):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/orders/public/:token/extra-quotes` | Cotizaciones adicionales de la orden (con líneas y fotos de evidencia). |
| POST | `/api/orders/public/:token/quotes/:quotationId/authorize` | El cliente autoriza/rechaza el trabajo extra (`client_authorized_at` + status). |

### Comprobante / PDF

- Backend `order-pdf.js`: el include ahora trae `photos`; se agregó la sección
  **EVIDENCIAS DEL SERVICIO** (foto, tipo, fecha, nota), excluyendo eliminadas
  vía `filterEvidencesForPdf`.
- Frontend `pdfGenerator.js`: misma sección en el PDF que descarga/envía el taller.

### Frontend

- `lib/api.js`: `evidencesService` (getByOrder, create, remove, send, createQuote)
  + `ordersService.getExtraQuotes` / `authorizeExtraQuote` (fetch público).
- `components/orders/ServiceEvidences.jsx`: sección **"Evidencias del servicio"**
  en el detalle de orden — subir (tipo + nota), historial con quién/cuándo,
  badge de "enviada", selección + envío por WhatsApp, eliminar y crear cotización
  adicional. **Gating de UI por permiso**: el auxiliar no ve "Agregar evidencia";
  enviar/eliminar/cotizar sólo aparecen para el maestro.
- `pages/mechanic/OrderDetail.jsx`: se inyectó `<ServiceEvidences>`.
- `pages/public/ClientPortal.jsx`: sección **"Trabajo extra por autorizar"** con
  botones Autorizar / No, gracias.

---

## 3. Permisos resultantes

| Acción | Maestro | Mecánico normal | Auxiliar |
|---|---|---|---|
| Ver evidencias | ✅ | ✅ | ✅ (si ve la orden) |
| Subir evidencia | ✅ | ✅ | ❌ 403 |
| Enviar al cliente (WhatsApp) | ✅ | ❌ 403 | ❌ 403 |
| Eliminar (soft delete) | ✅ | ❌ 403 | ❌ 403 |
| Crear cotización adicional | ✅ | sólo con `can_create_quotes` | ❌ 403 |

Maestro = `workspaceRole` owner/admin, o `Profile.is_master_mechanic`, o rol
`admin_mechanic`/`admin`. Auxiliar = `workspaceRole` auxiliary o
`Profile.requires_approval`. El resto es mecánico normal. El backend lee el
`Profile` en cada acción porque el JWT no transporta esas banderas.

---

## 4. Pruebas

`apps/api/test/evidences.test.js` — 16 pruebas (los 14 escenarios requeridos +
clasificación de roles + validación de tipos), runner nativo sin DB. Ver
`MOTOPARTES-SERVICE-EVIDENCES-QA.md`. **Suite completa: 60/60 PASS.**

---

## 5. Verificación realizada (validación operativa)

Toda la validación se corrió contra **PostgreSQL 16 real** (contenedor
`postgres:16-alpine` del compose, puerto host 5434) con datos preexistentes
(3 workspaces, 5 órdenes, 5 cotizaciones).

### 5.1 Migración 008 en PostgreSQL real

| Validación | Resultado |
|---|---|
| Corre sin error | ✅ (`ALTER TABLE`, `COMMENT`, `DO`/FK, `CREATE INDEX`) |
| Idempotente (2ª corrida) | ✅ sólo emite `NOTICE … already exists, skipping`, sin error |
| No destruye datos | ✅ hashes de ids de `orders`/`quotations` **idénticos** antes y después; counts 5/5 sin cambio |
| Columnas en `order_photos` | ✅ `evidence_type, deleted_at, deleted_by, delete_reason, sent_to_client_at, sent_by, quotation_id` |
| Columnas en `quotations` | ✅ `order_id, is_additional, client_authorized_at` |
| Índices | ✅ `idx_order_photos_evidence`, `idx_order_photos_quotation`, `idx_quotations_order` |
| FKs | ✅ `order_photos_quotation_id_fkey → quotations`, `quotations_order_id_fkey → orders` |
| Prisma Client opera tras migrar | ✅ E2E hace CRUD real vía Prisma sobre las nuevas columnas |

### 5.2 E2E real (API HTTP real + DB real + bot mock)

`apps/api/test-evidences-e2e.mjs` levanta la API real (`node src/index.js`,
puerto 3055 para no chocar con otros contenedores en :3000), un bot mock de
WhatsApp en :3002, siembra datos vía Prisma y golpea los endpoints con JWTs de
maestro / mecánico normal / auxiliar. **Resultado: 19/19 PASS** (cubre los 22
pasos del flujo). Detalle en `MOTOPARTES-SERVICE-EVIDENCES-QA.md`.

### 5.3 PDF real

El endpoint `GET /api/order-pdf/:id/download` devolvió un PDF válido (`%PDF-`,
~3.3 KB con 2 evidencias embebidas). Tras eliminar una evidencia (soft delete)
el PDF se regeneró con **menos bytes** (3295 → 3240), confirmando que la
evidencia eliminada **no se incluye**.

### 5.4 WhatsApp

Probado con **bot mock integrado** (no hay bot pareado en este entorno): el
endpoint `/api/evidences/send` respondió `success:true, sent:2` y marcó
`sent_to_client_at` + `sent_by` en las evidencias. El camino de **fallback**
(bot caído) está implementado igual que el envío de PDF existente: responde
`success:false, fallback:true` sin romper la orden, y la UI refleja el estado
real (no éxito falso).

### 5.5 Pruebas unitarias y build

- `npm test` (apps/api) → **60/60 PASS** (incluye 16 del módulo).
- `npx prisma validate` / `generate` → OK (v6.19.3).
- `npm run build` (apps/frontend) → build exitoso.

### 5.6 Revisión visual mobile/desktop → **NEEDS_REVIEW**

No hay navegador disponible en este entorno para captura visual. El frontend
**compila** y el componente se monta en `/mechanic/order/:id`, pero la revisión
visual a 360px y desktop **queda pendiente de validación manual** (ver runbook).
No se marca como PASS visual.

---

## 6. Deploy

**Estado: NO desplegado a producción (bloqueo deliberado por seguridad).**

Aplicar una migración de esquema a la base viva de un taller real es una acción
de alto impacto. Las credenciales de VPS/Dokploy se compartieron por chat; por
seguridad **no ejecuté cambios en producción sin confirmación explícita** y
recomiendo **rotar esas credenciales**. La rama quedó pusheada y lista para PR.

### Mecanismo real de aplicación del esquema en producción

El `CMD` del Dockerfile de la API ejecuta en cada arranque:

```
npx prisma db push --accept-data-loss && node prisma/seed-super-admin.js; node src/index.js
```

Es decir, **producción sincroniza el esquema desde `schema.prisma` con
`prisma db push`**, NO desde los `.sql` de `migrations/`. Por eso `schema.prisma`
es la fuente de verdad. Se declararon los índices nuevos como `@@index` en el
schema (`order_photos[order_id, evidence_type]`, `order_photos[quotation_id]`,
`quotations[order_id]`) para que `db push` los cree. El archivo
`008_service_evidences.sql` queda como **equivalente manual** (para staging o
aplicación fuera de Dokploy); ambos caminos producen columnas + FKs + índices
equivalentes (validado en Postgres real: `db push` sincroniza en ~450 ms sin
pérdida de datos; el `.sql` corre idempotente sin pérdida de datos).

> Observación de riesgo (preexistente, no introducida por este cambio): el flag
> `--accept-data-loss` en el arranque es seguro para cambios **aditivos** como
> este, pero si `schema.prisma` llegara a divergir de forma destructiva de la BD
> viva, ese flag aplicaría la pérdida. Para este módulo el diff es 100% aditivo.

### Runbook de deploy (ejecutar con confirmación + backup)

```
# 1. BACKUP de la BD de producción ANTES de nada
pg_dump "$DATABASE_URL_PROD" -Fc -f motopartes_pre008_$(date +%F).dump
pg_restore --list motopartes_pre008_*.dump | head   # validar el backup

# 2. (RECOMENDADO) Pre-aplicar el esquema aditivo ANTES de desplegar el código
#    nuevo, para que la app vieja siga sana y la nueva no encuentre columnas
#    faltantes. Opción A (igual que prod) o B (SQL manual) — equivalentes:
#    A)  cd apps/api && DATABASE_URL="$DATABASE_URL_PROD" npx prisma db push
#    B)  psql "$DATABASE_URL_PROD" -v ON_ERROR_STOP=1 -f migrations/008_service_evidences.sql

# 3. Merge del PR a main → Dokploy reconstruye y redepliega API + frontend.
#    El contenedor de la API corre `prisma db push` al arrancar (idempotente si
#    el paso 2 ya aplicó el esquema). `prisma generate` ocurre en el build.

# 4. Smoke test en vivo (ver checklist abajo).
```

> **Orden importante**: como el contenedor API hace `db push` al arrancar, el
> esquema queda aplicado sí o sí en el deploy. El paso 2 es una salvaguarda para
> evitar la ventana en que el código viejo conviva con el nuevo; con un solo
> servicio API es opcional, pero recomendado.

### Variables de entorno

**No requiere variables nuevas.** Usa las existentes: `DATABASE_URL`,
`WHATSAPP_API_KEY`, `WHATSAPP_BOT_INTERNAL_URL`, y `PHOTO_RETENTION_DAYS`
(opcional, default 30). El bot de WhatsApp **no requiere ajuste**: el envío de
evidencias reutiliza el endpoint existente `/send-document`.

### Reinicios

- **API**: redeploy (código nuevo + rutas `/api/evidences` + cliente Prisma).
- **Frontend**: rebuild/redeploy (componente `ServiceEvidences` nuevo).
- **whatsapp-bot (worker)**: **sin cambios, no requiere reinicio**.

### Rollback

1. **Código**: en Dokploy, redeploy de la imagen anterior (o `git revert` del
   merge y push). El módulo es aditivo; revertir el código no rompe datos.
2. **Esquema**: las columnas/índices/FKs nuevos son **aditivos y nullable** —
   dejarlos NO afecta al código viejo (los ignora). **Rollback de BD = no hacer
   nada** (recomendado). Si se exige revertir, restaurar el `pg_dump` del paso 1,
   o ejecutar el down manual:
   ```
   ALTER TABLE order_photos DROP CONSTRAINT IF EXISTS order_photos_quotation_id_fkey;
   ALTER TABLE quotations  DROP CONSTRAINT IF EXISTS quotations_order_id_fkey;
   DROP INDEX IF EXISTS order_photos_order_id_evidence_type_idx, order_photos_quotation_id_idx,
     quotations_order_id_idx, idx_order_photos_evidence, idx_order_photos_quotation, idx_quotations_order;
   ALTER TABLE order_photos DROP COLUMN IF EXISTS evidence_type, DROP COLUMN IF EXISTS deleted_at,
     DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS delete_reason,
     DROP COLUMN IF EXISTS sent_to_client_at, DROP COLUMN IF EXISTS sent_by, DROP COLUMN IF EXISTS quotation_id;
   ALTER TABLE quotations DROP COLUMN IF EXISTS order_id, DROP COLUMN IF EXISTS is_additional,
     DROP COLUMN IF EXISTS client_authorized_at;
   ```
   (Borrar columnas elimina cualquier evidencia/cotización adicional ya capturada;
   por eso el rollback preferido es "no tocar la BD" + rollback de código.)

### Checklist de deploy + smoke tests

- [ ] Backup `pg_dump` hecho y validado (`pg_restore --list`).
- [ ] (Opcional) Esquema pre-aplicado (paso 2).
- [ ] PR `feat/service-evidences-elihu` revisado y mergeado a `main`.
- [ ] Dokploy redeploy API + frontend OK; logs sin errores de Prisma.
- [ ] `curl https://motopartes.cloud/api/health` → `{"status":"ok"}`.
- [ ] Login maestro → abrir orden → ver sección "Evidencias del servicio".
- [ ] Subir 1 evidencia (tipo + nota) → aparece en el listado.
- [ ] Auxiliar NO ve "Agregar evidencia" (gating UI).
- [ ] Enviar evidencia por WhatsApp (bot pareado) → llega al cliente, queda "enviada".
- [ ] Crear cotización adicional desde evidencia → cliente la ve y autoriza en su enlace.
- [ ] Descargar comprobante/PDF → incluye sección "Evidencias del servicio".
- [ ] Eliminar evidencia (maestro) con motivo → desaparece del listado y del PDF.

### Pendientes reales

- Ejecutar este runbook en producción (requiere tu confirmación + backup).
- Revisión visual manual mobile/desktop (NEEDS_REVIEW).
- Envío WhatsApp **real** a un número de prueba (aquí validado con mock; el bot
  real depende de sesión pareada).
- Nota: `apps/api/.env` local se ajustó a `127.0.0.1:5434` para validar en
  Windows (IPv6); es un archivo local/gitignored, no afecta producción ni el
  `docker compose` (que usa el host interno `postgres:5432`).

