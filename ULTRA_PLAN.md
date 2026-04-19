# Ultra-Plan v2 — MotoPartes SaaS para talleres de motos

> **Fecha**: 2026-04-18 — versión revisada tras tus aclaraciones.
> **Estado**: bot reparado en vivo (Chromium SingletonLock). Plataforma operativa con 1 cliente real.

---

## 0. Marco de decisiones (lo que me aclaraste)

Estas son las reglas que fijan todo el plan:

1. **Producto = "MotoPartes"**, permanente. Dominio `motopartes.cloud` se queda. No renombramos nada del producto.
2. **Primer cliente real = taller "MotoPartes" (motoblaker91@gmail.com)** — coincidencia de nombre con el producto. Su workspace se vuelve el flagship. **NO debe notar que ahora es SaaS**: misma UI, mismos datos, misma sesión de WhatsApp, mismo branding (MotoPartes).
3. **Usuarios nuevos traen su propio branding** (logo, nombre de taller, colores, prefijo de folios, número de WhatsApp). Dentro de su workspace NO ven "MotoPartes" — ven lo suyo. "MotoPartes" sólo aparece en la landing/marketing/footer legal.
4. **Whatsapp-web.js se queda** — no migramos a WhatsApp Cloud API. El bot no hace envíos masivos, no lo necesitamos.
5. **El ecosistema actual se trata como una plantilla**: todo lo que sirve al taller original (wizard, flujo de 5 pasos, catálogo, permisos de mecánicos/auxiliares) es exactamente lo que un taller nuevo quiere. No reinventamos UX.
6. **Autonomía alta**: procedo con fixes reversibles sin preguntar. Sólo confirmo antes de tocar datos del taller real o cobros.

---

## 1. La estrategia en una frase

Partir de "un sistema hecho a la medida para un taller" y convertirlo en "una plataforma donde cada taller nuevo obtiene una copia vacía, personalizable, aislada de los demás, con la misma UX que ya probó el primer cliente real". El taller original sigue funcionando como siempre; los nuevos llegan a su propio espacio en blanco.

## 2. Modelo conceptual (cómo conviven el taller original y los nuevos)

Hoy hay UNA base de datos, UN frontend, UNA API, UN bot. Los tres primeros se conservan; cambia lo que tienen DENTRO:

```
ANTES                                DESPUÉS
─────                                ───────
Profile (global)                     Profile  ← login global
Client (global)                      Workspace ← taller
Order  (global)                      Membership(profile ↔ workspace)
...                                  Client (scoped a workspace)
                                     Order  (scoped a workspace)
                                     ...
1 sesión WhatsApp por mecánico      1 sesión WhatsApp por (workspace, mecánico)
Branding fijo "MotoPartes"           Branding por workspace (logo, color, nombre)
```

El workspace ID `ws_motopartes_original` guarda al 100% los datos de motoblaker + branding "MotoPartes" + su sesión de WhatsApp. Cuando él entra a `motopartes.cloud` y hace login, el sistema auto-selecciona su workspace (único al que pertenece) y le muestra lo mismo que hoy.

Un taller nuevo crea `ws_taller_juarez`. Entra a `motopartes.cloud`, crea cuenta, elige nombre "Taller Juárez", sube logo, configura colores, conecta su WhatsApp. Su dashboard muestra "Taller Juárez" en el header, folios "TJ-25-001", PDFs con su logo. NO ve nada de MotoPartes adentro.

## 3. Diagnóstico de problemas (sin cambios vs. v1)

Lo confirmado en el análisis vive ya en el [plan v1 §1.2](ULTRA_PLAN.md). Resumen de prioridades reales:

**P0 (tumban producción o exponen datos)**:
- B1 Chromium SingletonLock → **ya parchado en caliente 2026-04-18**. Falta dejarlo en el código.
- B2 URL mismatch API→bot para envío de PDF (`/api/send-document` vs `/send-document`).
- B3 `POST /api/admin/migrate-motos` sin auth, con sub-rutas que purgan órdenes.
- B4/B5 `JWT_SECRET` y `WHATSAPP_API_KEY` con fallback hardcodeado.
- B6 `GET /api/clients` y `/api/orders` sin filtrar (hoy irrelevante porque hay 1 workspace; bloqueante cuando haya 2+).

**P1 (deuda técnica / riesgo medio)**:
- B7 default password `motopartes123`
- B8 passwords legacy plaintext migrando on-login
- B9 `prisma db push` en Dockerfile
- D1 QR regenera infinito (122,486 intentos en logs)
- D2 sin backup Postgres
- F1 tracking link cliente deshabilitado
- F2 botón "ELIMINAR TODO" mal etiquetado

**P2/P3**:
- F3 `src/lib/supabase.js` legado
- F4 carpeta `src/` raíz vs `apps/frontend/`
- B10 cascade manual en delete user

## 4. Fases del plan (6 fases, tiempos conservadores)

---

### **Fase 1 — Hotfixes y protección del taller real (3-4 días)**

**Objetivo**: tapar las 5 bombas P0 sin tocar datos ni UX. El taller real sigue idéntico.

#### 4.1.1 Bot estable en producción
- ✅ **Ya hecho**: limpieza de `SingletonLock`/`SingletonSocket`/`SingletonCookie` + restart.
- **A hacer**: añadir en `apps/whatsapp-bot/Dockerfile` un entrypoint que limpie esos lock files ANTES de `node src/index.js`. Así cada redeploy automáticamente se auto-cura. (20 min)
- **A hacer**: en `WhatsAppSession.js`, cambiar `qrMaxRetries: 0` (infinito) por `qrMaxRetries: 10` real; después del décimo QR no escaneado, marcar sesión en BD como `requires_rescan` y detener la regeneración. (30 min)

#### 4.1.2 Parche de URL mismatch API→bot
`apps/api/src/routes/order-pdf.js` llama `${BOT_URL}/api/send-document`. El bot expone `/send-document` (sin `/api`). Cambiar la API para llamar al path correcto. Verificar con un test real desde el panel del taller (botón "Enviar por WhatsApp" en detalle de orden). (30 min + test)

#### 4.1.3 Proteger endpoint admin
`apps/api/src/routes/migrate-motos.js`:
- Añadir `preHandler: [authenticate, requireAdmin]` a todas las subrutas.
- Añadir allowlist por IP (tu IP de casa + VPS) vía env `ADMIN_IP_ALLOWLIST`.
- Eliminar las subrutas `/clear-pending` y `/clear-all-orders` — hoy son armas de destrucción masiva disfrazadas de "limpieza". El motor de seed/reset vive mejor como script one-off ejecutado desde el contenedor, no como endpoint HTTP. (1 hora)

#### 4.1.4 Forzar secretos desde env
`apps/api/src/middleware/auth.js` línea 3: cambiar
```js
const JWT_SECRET = process.env.JWT_SECRET || 'motopartes-secret-key-change-in-production';
```
por
```js
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { throw new Error('JWT_SECRET env var is required'); }
```
Igual con `WHATSAPP_API_KEY` en `order-pdf.js:6`. (15 min)

**Rotar ambos secretos** en Dokploy (panel → app → environment) antes de redeploy. El taller real verá un logout forzado (porque los tokens viejos ya no validan) y deberá volver a entrar. Aviso previo por WhatsApp interno. (15 min + 1h tiempo de aviso)

#### 4.1.5 Backup diario Postgres
Activar en Dokploy → postgres-index-virtual-system-t2hbwn → Backups:
- Frecuencia diaria 04:00 UTC.
- Retención 14 días.
- Destino: primero volumen local; después S3/B2 cuando haya presupuesto.
(10 min)

#### 4.1.6 Renombre cosmético
`AdminUsers.jsx:658` — "ELIMINAR TODO" → "Eliminar usuario" con `confirm()` a dos pasos. (10 min)

#### 4.1.7 Decidir tracking link del cliente
`/orden/:token` está comentado como "SUSPENDIDO". Propuestas:
- **A (recomendado)**: reactivar SÓLO para órdenes "en proceso" o "listas", con rate limit. Valor alto para UX. (1 hora)
- **B**: retirar código muerto por completo si no se piensa usar.

**Entregable Fase 1**: versión estable con cero P0, taller real sin disrupción funcional (sólo tendrá que relogearse una vez por rotación de JWT_SECRET).

---

### **Fase 2 — Limpieza del código y CI mínimo (1 semana)**

**Objetivo**: dejar el repositorio limpio y reproducible antes de tocar el schema.

#### 4.2.1 Eliminar rama legada local
- La carpeta `src/` raíz del repo es pre-migración desde Supabase. Todo lo vivo está en `apps/`. Mover `src/`, `public/`, `index.html`, `vite.config.js` raíz a un branch `archive/pre-dokploy-migration` y borrar de `main`. Reduce la confusión al editar.
- Borrar los ~80 scripts `check-*.cjs`, `debug-*.cjs`, `test-*.cjs`, `deploy-*.cjs` en la raíz — son herramientas de diagnóstico de la migración que ya no aplican. Si hay alguno útil, moverlo a `scripts/archive/`.
- Borrar `src/lib/supabase.js` dentro de `apps/frontend/` (si existe — ya vimos que ninguna página lo importa).

#### 4.2.2 Unificar Dockerfiles y compose local
- `apps/api/Dockerfile`: reemplazar `npx prisma db push` por `npx prisma migrate deploy`. `db push` funciona en dev pero en prod puede introducir drift silencioso. Crear migrations para reflejar el schema actual (baseline).
- `docker-compose.yml` raíz: que arranque en local los 3 servicios + Postgres con seeds de ejemplo. Hoy hay `docker-compose.dokploy.yml` que es lo de prod. El de dev debe ser independiente.
- Variables `.env.example` por servicio (`apps/api/.env.example`, etc.) con TODOS los env vars requeridos y comentarios.

#### 4.2.3 CI GitHub Actions
- Job `lint+build`: corre ESLint en frontend y API + `prisma validate` + build de imagen docker (sin push).
- Job `test-smoke`: monta un compose con Postgres efímero, corre API, hace `/api/health` + login con usuario seed.
- Activarlo sobre PRs a `main`.

#### 4.2.4 Tests críticos mínimos
- Unit: `authenticate()` middleware (token válido, expirado, firma incorrecta, sin header).
- Integración: flow `login → crear cliente → crear orden → generar PDF → endpoint bot responde 200`.
- Regresión del fix B2 (URL mismatch al bot).

**Entregable Fase 2**: repo ordenado, despliegues reproducibles, CI verde en cada PR.

---

### **Fase 3 — Multi-tenancy sin molestar al taller original (3-4 semanas)**

Es la fase más delicada. La regla de oro: **después de la migración, motoblaker91 debe poder entrar, hacer una orden y que todo funcione igual que ayer**.

#### 4.3.1 Diseño del schema multi-tenant

Tablas nuevas (9):

```prisma
model Workspace {
  id               String   @id @default(uuid()) @db.Uuid
  slug             String   @unique
  name             String
  business_type    String   @default("motorcycle")
  country          String   @default("MX")
  timezone         String   @default("America/Mexico_City")
  currency         String   @default("MXN")
  folio_prefix     String   @default("MP")
  plan_id          String?  @db.Uuid
  subscription_id  String?  @db.Uuid
  trial_ends_at    DateTime? @db.Timestamptz
  subscription_status String @default("trialing")
  stripe_customer_id String?
  branding         Json     @default("{}")  // logo_url, primary_color, secondary_color, tagline, pdf_footer
  settings         Json     @default("{}")  // horarios, notificaciones default
  is_active        Boolean  @default(true)
  created_by       String?  @db.Uuid
  created_at       DateTime @default(now()) @db.Timestamptz
  updated_at       DateTime @default(now()) @updatedAt @db.Timestamptz

  memberships      Membership[]
  invitations      Invitation[]
  usage_counters   UsageCounter[]
  plan             Plan? @relation(fields: [plan_id], references: [id])

  @@map("workspaces")
}

model Membership {
  id           String  @id @default(uuid()) @db.Uuid
  workspace_id String  @db.Uuid
  profile_id   String  @db.Uuid
  role         String  // owner | admin | mechanic | auxiliary
  permissions  Json    @default("{}")
  joined_at    DateTime @default(now()) @db.Timestamptz

  workspace    Workspace @relation(fields: [workspace_id], references: [id], onDelete: Cascade)
  profile      Profile   @relation(fields: [profile_id], references: [id], onDelete: Cascade)

  @@unique([workspace_id, profile_id])
  @@map("memberships")
}

model Plan {
  id                      String @id @default(uuid()) @db.Uuid
  code                    String @unique       // free | starter | pro | business | custom
  name                    String
  price_mxn_monthly       Int   @default(0)
  price_mxn_yearly        Int   @default(0)
  stripe_price_id_monthly String?
  stripe_price_id_yearly  String?
  features                Json  @default("{}") // ver §5.3
  is_active               Boolean @default(true)

  subscriptions  Subscription[]
  workspaces     Workspace[]

  @@map("plans")
}

model Subscription {
  id                     String   @id @default(uuid()) @db.Uuid
  workspace_id           String   @unique @db.Uuid
  plan_id                String   @db.Uuid
  stripe_subscription_id String?
  status                 String   // trialing | active | past_due | canceled | paused
  current_period_start   DateTime? @db.Timestamptz
  current_period_end     DateTime? @db.Timestamptz
  cancel_at              DateTime? @db.Timestamptz
  canceled_at            DateTime? @db.Timestamptz
  created_at             DateTime  @default(now()) @db.Timestamptz

  plan                   Plan @relation(fields: [plan_id], references: [id])

  @@map("subscriptions")
}

model UsageCounter {
  id                   String @id @default(uuid()) @db.Uuid
  workspace_id         String @db.Uuid
  period               String // 'yyyy-mm'
  orders_count         Int    @default(0)
  whatsapp_messages    Int    @default(0)
  storage_bytes        BigInt @default(0)
  updated_at           DateTime @default(now()) @updatedAt @db.Timestamptz

  workspace            Workspace @relation(fields: [workspace_id], references: [id], onDelete: Cascade)

  @@unique([workspace_id, period])
  @@map("usage_counters")
}

model Invitation {
  id           String   @id @default(uuid()) @db.Uuid
  workspace_id String   @db.Uuid
  email        String
  role         String
  token        String   @unique
  expires_at   DateTime @db.Timestamptz
  accepted_at  DateTime? @db.Timestamptz
  invited_by   String?  @db.Uuid
  created_at   DateTime @default(now()) @db.Timestamptz

  workspace    Workspace @relation(fields: [workspace_id], references: [id], onDelete: Cascade)

  @@map("invitations")
}

model WorkspaceAsset {   // logos, recursos subidos por workspace
  id           String @id @default(uuid()) @db.Uuid
  workspace_id String @db.Uuid
  kind         String // 'logo' | 'icon' | 'pdf_header' | 'pdf_footer'
  url          String
  bytes        Int
  mime_type    String
  uploaded_at  DateTime @default(now()) @db.Timestamptz

  @@index([workspace_id, kind])
  @@map("workspace_assets")
}

model AuditLog {   // eventos críticos (quien borró qué, cambios de plan, etc.)
  id           String @id @default(uuid()) @db.Uuid
  workspace_id String? @db.Uuid
  profile_id   String? @db.Uuid
  event        String  // 'subscription.changed' | 'user.invited' | 'order.deleted' | ...
  payload      Json
  created_at   DateTime @default(now()) @db.Timestamptz

  @@index([workspace_id, created_at])
  @@index([event, created_at])
  @@map("audit_logs")
}
```

Columna `workspace_id uuid NOT NULL` a las 15 tablas existentes: `Client`, `Motorcycle`, `Order`, `OrderService`, `OrderPart`, `OrderPhoto`, `OrderHistory`, `OrderUpdate`, `Appointment`, `Service`, `OrderStatus`, `MechanicEarning`, `OrderRequest`, `PaymentRequest`, `WhatsappSession`.

#### 4.3.2 Migración de datos (SIN TOCAR nada visible al taller real)

Script en una sola transacción:

1. Crear plan "flagship" especial (no comercializado) con `features: { unlimited: true, legacy_grandfathered: true }`.
2. Crear `Workspace` con `slug='motopartes'`, `name='MotoPartes'`, `folio_prefix='MP'`, `plan='flagship'`, `branding = { logo_url: 'https://motopartes.cloud/logo.png', primary_color: '...', tagline: '...' }`, `status='active'` (sin trial).
3. Crear `Membership` para cada profile existente apuntando a ese workspace, respetando el rol actual.
4. `UPDATE` masivo: todas las filas de las 15 tablas reciben `workspace_id = <id_del_workspace_motopartes>`.
5. Verificar counts antes/después (misma cantidad de órdenes, clientes, etc.).
6. Commit.

**Garantías para el taller real**:
- El `slug` del workspace es `motopartes`, pero cuando el usuario entra a `motopartes.cloud/login` el sistema detecta que pertenece a 1 solo workspace y lo auto-selecciona, SIN cambiar la URL. No necesita conocer la palabra "workspace".
- `folio_prefix='MP'` → las órdenes siguen generando `MP-25-001`, `MP-25-002`. No hay renumeración.
- `branding` incluye el logo y colores del diseño actual → nada cambia visualmente.
- `plan=flagship` evita que cualquier límite pagado nunca le corte.
- Su sesión de WhatsApp (`mechanic_id=0dc9ae6e-...`) sigue intacta, sólo se le agrega `workspace_id` en la tabla.

**Garantía de reversibilidad**: backup Postgres antes de ejecutar. Si algo sale mal, se restaura en <10 min.

#### 4.3.3 Middleware de scope en API

Nuevo archivo `apps/api/src/middleware/workspace.js`:
```js
// Lee workspace del header x-workspace-id o del JWT
// Valida que request.user pertenece a ese workspace (Membership existe)
// Inyecta request.workspaceId y request.role
```

Enriquecer JWT al login:
```
{ profileId, email, memberships: [{workspaceId, slug, role}] }
```

Al hacer login:
- Si el profile pertenece a 1 solo workspace → token ya trae su `workspaceId` por default.
- Si pertenece a >1 → frontend muestra selector de workspace.

#### 4.3.4 Refactor de rutas

Cambiar TODOS los `findMany`/`findFirst`/`create` de las 15 tablas scope-ables para incluir `workspace_id: request.workspaceId`. Ejemplo:

```js
// antes
const clients = await prisma.client.findMany();

// después
const clients = await prisma.client.findMany({
  where: { workspace_id: request.workspaceId },
});
```

Implementar como Prisma Extension para que sea automático y no se olvide:
```js
prisma.$extends({
  query: {
    client: {
      findMany: ({ args, query, operation }) => {
        args.where = { ...args.where, workspace_id: ctx.workspaceId };
        return query(args);
      },
      // ...
    },
    // repetir para las 15 tablas
  }
})
```

Test de regresión obligatorio: login del usuario de motoblaker, listar clientes → debe ver los mismos N clientes de antes. Crear un 2º workspace de prueba, login con otro usuario, listar clientes → ve 0. Cross-test: si pides el ID de un cliente del workspace 1 autenticado como workspace 2 → 404.

#### 4.3.5 Self-signup

Pantalla `/signup`:
- Email, password, nombre personal, nombre del taller (campo "Mi taller se llama:"), tipo (dropdown bloqueado en "Motocicletas"), teléfono.
- Crea `Profile`, `Workspace(slug=generado-a-partir-del-nombre)`, `Membership(role=owner)`, `Subscription(plan=free, status=trialing, trial_ends_at=+14d a Pro)`.
- Envía email de verificación (Resend recomendado, cuesta ~$0 para primeros 3k emails/mes).

Wizard post-verificación (ya logueado, forzado hasta completar):
- **Paso 1 — Identidad del taller**: nombre (pre-llenado), slogan, teléfono principal, dirección.
- **Paso 2 — Branding**: upload de logo (max 500KB, PNG/SVG), color primario (selector), color secundario.
- **Paso 3 — Folios y unidades**: prefijo de folio (2-4 chars, default = 2 primeras letras del nombre), moneda (MXN default), husos horarios, formato de fecha.
- **Paso 4 — Catálogo inicial**: checkbox "cargar catálogo de 10 servicios pre-hechos para talleres de moto" (cambio de aceite, afinación, frenos, cadena, llantas, balanceo, diagnóstico eléctrico, lavado, ajuste de suspensión, revisión general, con precios editables).
- **Paso 5 — Conectar WhatsApp**: QR code de la sesión del owner. Si escanea ahora, bot queda listo.
- **Paso 6 — Invitar equipo**: email(s) de mecánicos/auxiliares que tendrán acceso.

Checklist persistente en dashboard hasta completar pasos 2, 4 y 5 (los otros son opcionales).

#### 4.3.6 Panel de branding en ajustes

`/settings/workspace`:
- Cambiar logo, colores, nombre, slogan.
- Preview en vivo del header y del PDF.
- Campo "footer legal de PDF" (ej. "Taller Juárez — RFC XXXXXX, Av. Principal 123").
- Configurar prefijo de folios (advertencia: cambia la numeración desde la siguiente orden).

Las plantillas de PDF (`apps/api/src/routes/order-pdf.js`) deben leer `workspace.branding` al generar: logo en header, colores en títulos/líneas, footer personalizado. Hoy está hardcodeado rojo MotoPartes.

**Entregable Fase 3**: un taller externo (test) se registra, pasa onboarding, crea su primera orden con su branding, envía por WhatsApp, recibe PDF con su logo. Motoblaker sigue entrando como siempre sin notar cambios.

---

### **Fase 4 — Billing (Stripe + MercadoPago MX) (2 semanas)**

**Objetivo**: que el usuario nuevo pueda ingresar tarjeta, pagar y que el plan cambie automáticamente. El taller real sigue exento.

#### 4.4.1 Integración Stripe
- Crear productos y precios en el dashboard de Stripe (uno por combinación plan×frecuencia).
- Seeder que poble la tabla `Plan` con `stripe_price_id_*`.
- `POST /api/billing/checkout` → genera Checkout Session, retorna URL; frontend redirige.
- `POST /api/billing/webhook` (sin auth, con validación de firma) → actualiza `Subscription.status` y `current_period_end` cuando Stripe manda `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`.
- Reset de `UsageCounter` al inicio de cada `current_period` para planes que cobran por mes.

#### 4.4.2 Downgrade/dunning
- Si `invoice.payment_failed`: email al owner + banner en dashboard.
- Si pasan 7 días en `past_due`: downgrade automático al plan free + aviso; las features Pro se desactivan.
- Si `canceled`: grace period de 14 días (acceso read-only); después, sólo descargas de PDFs históricos.

#### 4.4.3 Alternativa MercadoPago (opcional Fase 4.5)
México tiene mejor conversión con MercadoPago. Implementar como 2º método de pago (si el usuario prefiere transferencia/OXXO). Webhook equivalente. No bloqueante para Fase 4.

#### 4.4.4 Enforcement en runtime
Hook en cada `create` relevante:
```js
// antes de crear orden
const usage = await getUsage(workspaceId, currentPeriod);
const plan = await getPlanFeatures(workspaceId);
if (plan.orders_per_month !== null && usage.orders_count >= plan.orders_per_month) {
  throw new PlanLimitError('orders_per_month');
}
// ... crear orden ...
await incrementUsage(workspaceId, 'orders_count');
```

Wrap en middleware reutilizable por tipo de acción (`enforceLimit('orders')`, `enforceLimit('whatsapp_messages')`, `enforceStorage(bytes)`).

#### 4.4.5 UI billing
`/settings/billing`:
- Plan actual + next billing date + botón "Cambiar plan" (abre checkout).
- Historial de facturas (hosted por Stripe vía `invoice_pdf_url`).
- Botón "Cancelar suscripción" (cancelación al final del periodo).
- Medidor de uso actual (X/Y órdenes este mes, X GB/Y GB de fotos, etc.).

**Entregable Fase 4**: primer pago real funcionando end-to-end. Test con tarjeta Stripe de prueba + tarjeta real tuya.

---

### **Fase 5 — Automatizaciones + polish del bot (2 semanas)**

**Objetivo**: volver las automatizaciones un feature visible por el que vale la pena pagar Pro.

#### 4.5.1 Motor de workflows
Tabla `Automation`:
```
id, workspace_id, trigger, action, params (jsonb), enabled, created_at
```

**Triggers**:
- `order.created` / `order.status_changed` (con filtro de estado destino) / `order.paid` / `order.completed`
- `appointment.upcoming(24h)` / `appointment.upcoming(2h)`
- `order.idle_3_days`
- `client.first_visit_anniversary`
- `moto.service_due` (basado en km + promedio)

**Actions**:
- `whatsapp.send_template(template_id, vars)`
- `pdf.send_quote`
- `email.send_template`
- `task.create`
- `webhook.fire(url)` (Business only)

Implementación: worker que corre cada 60s (puede ser cron en el contenedor API) y evalúa triggers temporales (`upcoming`, `idle`, `anniversary`). Triggers event-based (`created`, `paid`, `status_changed`) se disparan desde dentro de las rutas correspondientes con `await triggerAutomation(event, payload)`.

#### 4.5.2 Plantillas pre-cargadas por workspace
Al crear workspace nuevo, seedear 7 automatizaciones deshabilitadas por default (el owner las activa una por una):
1. Confirmación de ingreso
2. Cotización enviada
3. Listo para recoger
4. Recordatorio cita 24h
5. Feedback post-servicio + 2 días
6. Aniversario del primer servicio
7. Orden estancada > 3 días

Editor: UI visual con placeholders `{cliente}`, `{marca}`, `{modelo}`, `{folio}`, `{total}`, `{fecha}`, `{taller}`. Preview en vivo.

#### 4.5.3 Robustez del bot (sin Cloud API, como acordamos)
Quedarnos en `whatsapp-web.js` implica endurecer lo que ya hay:
- **Limpieza automática de locks** (ya planeado Fase 1) + health check cada 60s que detecta "sesión muerta" y reinicia automáticamente.
- **Scope por workspace**: `/app/data/wwebjs_auth/workspace-<ws_id>/session-<mechanic_id>/`. Evita colisiones entre talleres.
- **Validación doble en cada endpoint del bot**: `x-api-key` Y que `workspace_id` del request coincida con el de la sesión. Un taller no puede enviar mensajes por el WhatsApp de otro, aunque se filtre la API key.
- **Cola de mensajes** (simple, en-memoria, con retry) para que si WhatsApp está momentáneamente desconectado, el mensaje se reintente 3 veces antes de fallar. Tope: 100 mensajes en cola por workspace.
- **Contador de mensajes** por workspace + mes para billing enforcement.
- **Estado real del bot en dashboard**: "Conectado como +52 xxx..." con última vez visto. Hoy el UI es ciego a esto.
- **Cerrar/reabrir sesión** desde UI: botón "Desconectar WhatsApp" + "Conectar otro número" sin tener que reiniciar el servidor.

#### 4.5.4 Health observability
- Dashboard interno (sólo para ti como super-admin) en `/admin/health` con: memoria del bot, sesiones activas por workspace, últimos 20 errores, tasa de éxito de envíos.
- Endpoint `/admin/health.json` protegido que escupe métricas en formato Prometheus para alertas futuras.

**Entregable Fase 5**: un taller puede activar 3 automatizaciones y verlas disparar mensajes. Bot reportando estado "saludable" en tiempo real. Workspace "MotoPartes" original sigue funcionando igual que en Fase 0.

---

### **Fase 6 — Growth y crecimiento (continuo, sin techo)**

Ya SIN WhatsApp Cloud API (confirmado que no la queremos) y sin renombrar nada. Esta fase es ganar clientes y afinar experiencia.

#### 4.6.1 Landing pública
Hoy `motopartes.cloud` redirige a login. Dividir:
- `motopartes.cloud/` → landing marketing (nuevo) con planes, hero "Gestiona tu taller de motos desde WhatsApp", videos, testimonios, botón CTA a signup.
- `motopartes.cloud/login` → login (como hoy).
- `motopartes.cloud/app` → dashboard post-login.

La landing puede ser página estática en el mismo nginx del frontend.

#### 4.6.2 SEO y contenido
- Blog en `/blog` con artículos de valor ("10 servicios imprescindibles", "Cómo llevar las ganancias por mecánico", etc.). Genera tráfico orgánico.
- Página `/casos` con casos reales (empezar por el taller original, con su permiso).
- Schema.org de "SoftwareApplication".

#### 4.6.3 Programa de afiliados (dos niveles)
- **Afiliado estándar** (para todos los workspaces): link `motopartes.cloud/?ref=<slug>`, 20% del MRR por 12 meses de cada taller referido.
- **Partner** (contractual, sólo motoblaker al inicio): 30% del MRR **vitalicio** (ver §6.5).
- Tabla `Referral(referrer_workspace_id, referred_workspace_id, commission_rate, starts_at, ends_at_nullable)` + dashboard `/settings/referrals` con link, clicks, conversiones, comisiones pendientes, comisiones pagadas.
- Pago mensual a afiliados: transferencia SPEI o depósito, según preferencia.

#### 4.6.4 Integraciones de alto valor
- **Google Calendar**: sincroniza citas del taller.
- **Google Sheets**: exporta ganancias mecánicas a Sheets para contabilidad.
- **QR del taller**: genera QR físico para poner en la entrada, que al escanearse abre WhatsApp con mensaje pre-llenado "Hola, quiero agendar cita".

#### 4.6.5 App móvil (opcional)
React Native reutilizando AuthContext/DataContext. Prioriza: login, lista de órdenes asignadas, cambiar estado, tomar fotos, subirlas. Publicar en Google Play (MX tiene alta penetración Android).

#### 4.6.6 Internacionalización (más adelante)
Infraestructura i18n: envolver strings en `t('key')`. Primer idioma adicional cuando haya demanda (probablemente portugués para Brasil — mercado moto enorme).

---

## 5. Planes sugeridos (revisados — sin cambios respecto a v1)

| Característica | Free | Starter | Pro | Business | **Flagship (motoblaker)** |
|---|---|---|---|---|---|
| Precio/mes (MXN) | $0 | $299 | $599 | $1,499 | $0 (cortesía perpetua) |
| Precio/año (−20%) | $0 | $2,870 | $5,750 | $14,390 | — |
| Órdenes/mes | 30 | 200 | Ilimitado | Ilimitado | Ilimitado |
| Usuarios | 2 | 5 | 15 | Ilimitado | Ilimitado |
| Sesiones WhatsApp | 1 | 1 | 3 | 10 | Ilimitado |
| Mensajes WhatsApp/mes | 300 | 2,000 | 10,000 | Ilimitado | Ilimitado |
| Almacenamiento fotos | 500 MB | 5 GB | 25 GB | 100 GB | Ilimitado |
| Portal público cliente | ✓ | ✓ | ✓ | ✓ | ✓ |
| Branding (logo, colores, folio) | ✗ | Básico | Completo | Completo + dominio propio | Completo |
| Automatizaciones | ✗ | 1 tipo | 5 tipos | Ilimitado | Ilimitado |
| Reportes avanzados | ✗ | ✗ | ✓ | ✓ | ✓ |
| Comisiones multi-mecánico | ✗ | ✗ | ✓ | ✓ | ✓ |
| API pública + webhooks | ✗ | ✗ | ✗ | ✓ | ✓ |
| Soporte | Comunidad | Email 48h | Email 24h | WhatsApp priority | Directo a ti |

**Trial de 14 días al Pro** al registrarse — conversion típica 15-25%.

El workspace flagship de motoblaker tiene todas las features sin límites y sin cobro. Es contractual: él fue el primer cliente que te pagó el desarrollo; esta cortesía debería quedar por escrito por si algún día vendes el SaaS.

## 6. Resumen: qué cambia para el taller real vs. qué ve un taller nuevo

| Aspecto | Taller real (motoblaker) | Taller nuevo |
|---|---|---|
| Login | `motopartes.cloud/login` (igual) | Igual |
| Branding | MotoPartes (igual) | El suyo (configurado en onboarding) |
| Logo | MotoPartes (igual) | El que subió |
| Prefijo folio | MP- (igual) | El que eligió (ej. TJ-) |
| Sesión WA | Intacta tras migración | Escanea QR en onboarding |
| Plan | Flagship (gratis, sin límites) | Free → trial Pro 14d → Free o Pro |
| Catálogo servicios | El suyo actual | Template pre-cargado, editable |
| Datos existentes | Conservados 1:1 | Vacío inicial |
| Emails | Mismos remitentes/templates | Con branding del taller nuevo |
| PDF de orden | Diseño actual, su logo | Mismo layout, su logo y colores |
| Portal cliente | Mismo (si reactivamos) | Mismo, con su branding |
| Notificaciones WA | Mismas plantillas | Mismas (editables) |

Concretamente: el taller original debería abrir una orden en Fase 3+ y no notar ninguna diferencia visual.

## 6.5. Modelo de partnership con el taller MotoPartes (socio estratégico)

Idea propuesta por ti: en lugar de tratar a motoblaker sólo como "el primer cliente al que no hay que molestar", convertirlo en **socio estratégico visible**. El taller MotoPartes puede presentarse ante su red y su gremio como co-creador del sistema: "nosotros como taller extendimos nuestra operación y construimos esta plataforma; ahora está disponible para otros talleres".

Esto cambia varias cosas de golpe:

### 6.5.1 Narrativa de marca
- Landing headline: *"La plataforma que Motopartes usa a diario — ahora disponible para tu taller."*
- Sección "Historia": el taller que se cansó de llevar órdenes en libreta y construyó la solución que ahora tú puedes usar.
- Video de 90 segundos grabado en su taller real: motoblaker mostrando cómo recibe una moto, crea la orden, manda cotización por WhatsApp, cierra la venta. Prueba social imbatible.
- Logo suyo en la landing ("Usado por:"), testimonial firmado, fotos del taller.

Esto es mucho más fuerte que una landing genérica con stock photos. Un mecánico potencial cliente ve a otro mecánico usándolo.

### 6.5.2 Canal de distribución
Motoblaker tiene una red real que tú no: otros talleres de moto en su ciudad, proveedores que visitan varios talleres (son multiplicadores naturales), grupos de Facebook/WhatsApp de mecánicos, eventos y ferias, clientes que a su vez son mecánicos. Es un canal orgánico que le cuesta cero levantar.

Tácticas concretas:
- QR físico en su taller: "¿Tu taller también necesita orden? Escanéame" → landing con `?ref=motopartes`.
- Referidos cara a cara: cuando un proveedor visita su taller, motoblaker le muestra la pantalla y le dice "¿conoces a otros talleres que les sirva?".
- Posts en redes suyas: "Este mes despachamos 60 órdenes sin una sola libreta. Si eres taller y quieres lo mismo, [link]".
- Workshops presenciales en su local: "ven a ver cómo lo uso yo".

### 6.5.3 Revenue share (propuesta de negociación)

**Programa afiliado estándar** (para cualquier usuario): 20% del MRR durante 12 meses por cada taller que traiga.

**Programa partner MotoPartes** (sólo para él, contractual): 30% del MRR **vitalicio** por cada taller referido que pague, sin tope temporal. Mientras el referido siga pagando, motoblaker cobra su 30%.

Ejemplo numérico: si trae 20 talleres que en promedio pagan $599 MXN/mes (Pro), son $3,594 MXN/mes pasivos para él. En un año, son 20 × $599 × 12 × 30% = **$43,128 MXN** al año por esos 20 referidos. A él le conviene promocionarlo activamente.

Para ti: el otro 70% de $599 × 20 = $8,386 MXN/mes de MRR traído por él, a un costo de adquisición de $0. Es una de las mejores estructuras posibles: paga comisión alta sólo sobre éxito, no hay costo fijo, y alinea incentivos.

### 6.5.4 Co-branding (sutil, opcional)
- En la landing: sección "Hecho con" / "En colaboración con" + logo del taller MotoPartes.
- En el footer del marketing: "Desarrollado junto al taller Motopartes".
- En sus PDFs hacia SUS clientes: sutil "powered by MotoPartes" al pie (ya viene por ser su workspace; no hay conflicto).
- NO ponemos "powered by MotoPartes workshop" en los workspaces de otros talleres. Eso confundiría.

La doble lectura del nombre (producto y taller se llaman igual) se convierte en virtud narrativa en lugar de confusión: *"Sí, el producto se llama MotoPartes porque nació en el taller MotoPartes."*

### 6.5.5 Términos a negociar con él (borrador)
Antes de anunciar nada, acuerdo escrito con motoblaker que cubra:
- **Rol**: socio/embajador (no empleado, no co-propietario de la compañía por ahora).
- **Compensación**: 30% MRR vitalicio de referidos directos. Revisable a los 12 meses.
- **Cortesía**: workspace flagship sin costo perpetuo.
- **Obligaciones suyas**: usar el sistema consistentemente, permitir grabar contenido (video, fotos, testimonios), ceder derecho de imagen para marketing de MotoPartes.
- **Obligaciones tuyas**: darle soporte prioritario, consultarle antes de cambios visibles en su workspace, pagar la comisión mensual con corte fijo.
- **Exclusividad**: no tiene que ser exclusivo — él puede seguir su operación como taller normal; sólo pedimos que no promocione competencia directa (Xalapa Motos Manager hipotético) mientras sea partner.
- **Salida**: cualquiera puede salir del acuerdo con 30 días de aviso; pagos por referidos activos se respetan 6 meses post-salida.

Si le gusta el plan, formalizamos con un contrato simple (1-2 páginas, plantilla de partnership de creators). No necesita abogado por ahora.

### 6.5.6 Impacto en el plan técnico
Nada estructural cambia, pero sí se ajusta:

- **Fase 3** (onboarding): el campo "¿cómo te enteraste?" incluye opción "referido por MotoPartes" y recoge `ref=motopartes` del URL.
- **Fase 4** (billing): la tabla `Referral` ya estaba prevista; sólo añadir columna `commission_rate` por partner para que motoblaker tenga el 30% vitalicio y los demás el 20% por 12 meses.
- **Fase 5**: dashboard `/partner` (solo visible si el workspace es partner) con referidos, MRR acumulado, pagos pendientes, link de referido y QR descargable.
- **Fase 6**: la landing se diseña alrededor del testimonial de él, no como un extra.

### 6.5.7 Timing recomendado
- **Hoy**: no anunciar nada todavía. Primero Fase 1 (hotfixes) y Fase 2 (limpieza).
- **Antes de Fase 3** (migración multi-tenant): conversación formal con motoblaker presentándole la idea del partnership. Que sepa que su experiencia NO cambiará y que el upside es real.
- **Fase 4 terminada**: firma del acuerdo. A estas alturas el billing funciona y puedes procesar comisiones de verdad.
- **Fase 6 arranque**: lanzamiento público con él como cara visible en la landing.

## 7. Cronograma consolidado

| Fase | Duración | Arranca | Cierra | Entregable clave |
|---|---|---|---|---|
| 1 — Hotfixes | 3-4 días | Hoy (si OK) | Día 4 | 5 P0 tapados, bot estable en código |
| 2 — Limpieza + CI | 1 semana | Día 5 | Día 12 | Repo limpio, CI verde, `migrate deploy` |
| 3 — Multi-tenancy + signup | 3-4 semanas | Día 13 | Día 40 | Un taller nuevo real probado end-to-end |
| 4 — Billing Stripe | 2 semanas | Día 41 | Día 55 | Primer pago real procesado |
| 5 — Automatizaciones + bot robusto | 2 semanas | Día 56 | Día 70 | 3 automatizaciones usadas por talleres |
| 6 — Growth | Continuo | Día 71 | — | Landing + SEO + afiliados |

Total hasta MVP monetizable: **~10 semanas**. Primer ingreso externo realista: **12 semanas** (dejando 2 semanas de soak/marketing después de Fase 4).

## 8. Riesgos con foco en "no romper al taller real"

| Riesgo | Mitigación |
|---|---|
| Migración de `workspace_id` corrompe datos del taller | Backup Postgres antes; transacción única; query de verificación de counts pre/post; revertir en <10 min si falla |
| Rotación de JWT_SECRET saca al taller del login y no entiende por qué | Coordinar ventana con motoblaker por WhatsApp, 1h de aviso, explicar que sólo se reloguea |
| Dependency del bot sobre layout viejo de WhatsApp Web cambia | Mantener `patch-wwebjs.cjs` actualizado; bump de `whatsapp-web.js` cada 3 meses en ventana controlada |
| Un usuario nuevo malintencionado explora la API y descubre IDs del taller real | Mitigado por el filtro `workspace_id`; tests cross-workspace obligatorios (Fase 3) |
| El 1 VPS con 7.8GB RAM se queda corto con 10+ talleres | Mover bot a VPS dedicado cuando lleguemos a 5 talleres Pro; Postgres también puede separarse |
| Chromium lock se repite (§5.3 Fase 5) | Fix en Dockerfile ya previsto + health check auto-reparador |
| El dueño (tú) recibe tickets 24/7 y se quema | Plan Business con soporte prioritario cobra esta carga; contratar soporte parcial cuando MRR > $15k MXN |

## 9. Preguntas pendientes (lo único que necesito antes de arrancar Fase 1)

1. **Tracking link cliente** (`/orden/:token`): ¿reactivar (opción A) o retirar código (opción B)?
2. **Verificación email al signup**: ¿usamos Resend (gratis hasta 3k/mes, excelente deliverability) o esperamos a Fase 4 y hacemos login sin verificación en Fase 3?
3. **Nombres de planes**: ¿Free/Starter/Pro/Business te suenan bien o prefieres ES puro (Gratis/Inicial/Profesional/Negocio)? El flagship se queda sin nombre público.
4. **Pre-aviso a motoblaker**: ¿le avisas tú por WhatsApp antes de la ventana de Fase 1 (rotación de secrets + restart) o quieres que te redacte el mensaje?
5. **Precios**: ¿la matriz de §5 te parece bien o ajustamos? (Mercado MX talleres: $299 MXN es el punto dulce para el plan starter).
6. **Partnership con motoblaker** (§6.5): ¿lo planteas como conversación informal o quieres que te redacte una propuesta por escrito para presentársela? Si sí, ¿antes de Fase 1 o después? Y la comisión del 30% vitalicio — ¿te parece o ajustamos (25% / 35%)?

## 10. Próximo paso concreto

Con luz verde, arranco Fase 1 inmediatamente en este orden:

1. Parchar `order-pdf.js` para corregir URL al bot (B2). (~30 min)
2. Blindar `migrate-motos.js` con auth + eliminar sub-rutas de purga (B3). (~1h)
3. Forzar `JWT_SECRET` + `WHATSAPP_API_KEY` desde env con `throw` si faltan (B4/B5). Rotar en Dokploy. (~1h + coordinar ventana con motoblaker)
4. Dejar la limpieza de `SingletonLock` en el `Dockerfile` del bot (B1 código). (~20 min)
5. Arreglar loop de QR infinito (D1). (~30 min)
6. Activar backup Postgres diario en Dokploy (D2). (~10 min)
7. Renombrar "ELIMINAR TODO" → "Eliminar usuario" con doble confirm (F2). (~10 min)
8. Decidir + aplicar F1 (tracking link) según elección.

Tiempo total: ~4 horas + 1 ventana de deploy coordinada con el taller real.

Dime A/B/etc. en las 5 preguntas de §9 y arranco.
