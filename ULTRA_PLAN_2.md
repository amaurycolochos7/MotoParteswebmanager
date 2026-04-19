# Ultra-Plan 2 — Panel Super-Admin + Sistema de Tickets (Fase 7)

> **Fecha**: 2026-04-19
> **Estado inicial**: MotoPartes con Fases 1-6 desplegadas. 1 taller pagante real (motoblaker, flagship). Necesidad: panel operativo para el dueño (Amaury) que permita ver todo el negocio a vista de pájaro y dar soporte a los clientes.
> **Ámbito**: una única Fase 7 partida en 4 sub-fases. NO cambia nada del panel de taller ni de la landing; solo agrega superficie nueva.

---

## 0. Marco de decisiones

1. **El panel es del dueño del SaaS (Amaury)**, NO del dueño de cada taller. Se accede por URL separada y con login separado. Los talleres nunca lo ven.
2. **Un solo super-admin primario al inicio** (`amaury.colochos7@gmail.com`). Arquitectura admite varios para cuando se contrate soporte.
3. **Arquitectura paralela al admin de taller**, no sustitutiva. El panel `/admin/*` sigue siendo del workspace; el nuevo `/super/*` es cross-workspace.
4. **Reutilizar Stripe para lo pagado; los planes manuales saltan Stripe** con flag `Subscription.source='manual'`. Así das Pro gratis a un amigo sin involucrar tarjetas.
5. **Audit log inmutable** del super-admin. Ni siquiera el super puede borrar su rastro (triggers Postgres append-only).
6. **Impersonation con banner rojo** + razón obligatoria + max 1h + log imborrable de cada entrada.
7. **Los tickets son la cara pública del soporte**: tiempos de respuesta medibles, plantillas, macros. Diseñado para profesionalizar desde el día 1 aunque solo atiendas tú.
8. **Autonomía alta en ejecución**: procedo con fixes reversibles sin preguntar; solo confirmo antes de tocar cobros reales o datos del taller real.

---

## 1. Modelo conceptual (qué cambia)

```
HOY                                       DESPUÉS
────                                      ───────
Profile.role = admin | mechanic | ...     + Profile.is_super_admin  (ortogonal al rol de workspace)
                                          Los super-admins NO necesitan membership a workspaces,
                                          son "supra-tenant".

/admin/*    ← panel del taller             /admin/*       ← igual (scope = workspace)
                                          /admin/support ← NUEVO (cliente crea/lee sus tickets)
/login      ← login                        /login         ← igual
                                          /super         ← NUEVO panel del dueño
                                          /super/login   ← login separado, exige is_super_admin

Billing: Stripe decide todo                Billing: fuente ∈ { stripe | manual | grandfathered }
                                          Subscription con `source` y `manual_expires_at`

Sin soporte formal                         SupportTicket + TicketMessage + TicketAttachment
                                          con estados, SLA, plantillas, macros, notas internas.
```

---

## 2. Schema Prisma

### 2.1 Campos nuevos en tablas existentes

```prisma
model Profile {
  ...
  is_super_admin           Boolean  @default(false)
  super_admin_2fa_secret   String?                 // TOTP cifrado at-rest (Fase 7.4)
  super_admin_2fa_enabled  Boolean  @default(false)
  super_admin_added_at     DateTime? @db.Timestamptz
  super_admin_added_by     String?  @db.Uuid
  ...
}

model Subscription {
  ...
  source             String    @default("stripe")  // 'stripe' | 'manual' | 'grandfathered'
  manual_assigned_by String?   @db.Uuid            // super-admin que asignó
  manual_expires_at  DateTime? @db.Timestamptz     // null = sin caducidad (flagship)
  manual_note        String?                        // "Cortesía 30d por bug 2026-04-19"
  ...
}

model Workspace {
  ...
  suspended_at       DateTime? @db.Timestamptz
  suspended_reason   String?
  suspended_by       String?   @db.Uuid
  ...
}
```

### 2.2 Tablas nuevas (5)

```prisma
// ────────── SOPORTE ──────────

model SupportTicket {
  id                 String    @id @default(uuid()) @db.Uuid
  ticket_number      Int       @default(autoincrement())   // #00001 visible al cliente
  workspace_id       String?   @db.Uuid
  created_by         String?   @db.Uuid
  subject            String
  category           String                                 // billing | technical | feature_request | account | whatsapp | onboarding | other
  priority           String    @default("normal")           // low | normal | high | urgent
  status             String    @default("open")             // open | waiting_customer | waiting_admin | resolved | closed | spam
  assigned_to        String?   @db.Uuid
  first_response_at  DateTime? @db.Timestamptz
  resolved_at        DateTime? @db.Timestamptz
  last_message_at    DateTime  @default(now()) @db.Timestamptz
  last_message_from  String?                                // 'customer' | 'admin'
  customer_unread    Int       @default(0)
  admin_unread       Int       @default(0)
  tags               String[]  @default([])
  metadata           Json      @default("{}")               // browser, device, url, app_version
  created_at         DateTime  @default(now()) @db.Timestamptz
  updated_at         DateTime  @default(now()) @updatedAt @db.Timestamptz

  workspace   Workspace?         @relation(fields: [workspace_id], references: [id], onDelete: SetNull)
  creator     Profile?           @relation("TicketCreator",  fields: [created_by],  references: [id], onDelete: SetNull)
  assignee    Profile?           @relation("TicketAssignee", fields: [assigned_to], references: [id], onDelete: SetNull)
  messages    TicketMessage[]
  attachments TicketAttachment[]

  @@unique([ticket_number])
  @@index([workspace_id, status])
  @@index([status, priority, last_message_at])
  @@index([assigned_to, status])
  @@map("support_tickets")
}

model TicketMessage {
  id           String   @id @default(uuid()) @db.Uuid
  ticket_id    String   @db.Uuid
  author_id    String?  @db.Uuid
  author_type  String                            // 'customer' | 'admin' | 'system'
  body_md      String   @db.Text                 // markdown sanitizado server-side
  is_internal  Boolean  @default(false)          // nota privada entre super-admins
  created_at   DateTime @default(now()) @db.Timestamptz

  ticket      SupportTicket      @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  author      Profile?           @relation(fields: [author_id], references: [id], onDelete: SetNull)
  attachments TicketAttachment[]

  @@index([ticket_id, created_at])
  @@map("ticket_messages")
}

model TicketAttachment {
  id           String   @id @default(uuid()) @db.Uuid
  ticket_id    String   @db.Uuid
  message_id   String?  @db.Uuid
  filename     String
  mime_type    String
  size_bytes   Int
  url          String                            // S3/B2 o volumen local según fase
  uploaded_by  String?  @db.Uuid
  created_at   DateTime @default(now()) @db.Timestamptz

  ticket  SupportTicket  @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  message TicketMessage? @relation(fields: [message_id], references: [id], onDelete: SetNull)

  @@map("ticket_attachments")
}

model CannedResponse {
  // Plantillas reutilizables por super-admin.
  id         String   @id @default(uuid()) @db.Uuid
  shortcut   String   @unique                    // "/qr-bot" → dispara plantilla
  title      String
  body_md    String   @db.Text
  category   String?
  created_by String   @db.Uuid
  use_count  Int      @default(0)
  created_at DateTime @default(now()) @db.Timestamptz

  @@map("canned_responses")
}

// ────────── AUDITORÍA SUPER-ADMIN ──────────

model SuperAdminAction {
  // APPEND-ONLY. Trigger Postgres bloquea DELETE/UPDATE.
  id             String   @id @default(uuid()) @db.Uuid
  super_admin_id String   @db.Uuid
  action         String                          // plan.assigned | workspace.suspended | ticket.resolved | impersonate.start | ...
  target_type    String                          // workspace | ticket | profile | subscription | referral_payout
  target_id      String?  @db.Uuid
  payload_before Json?                           // snapshot antes
  payload_after  Json?                           // snapshot después
  reason         String?
  ip_address     String?
  user_agent     String?
  created_at     DateTime @default(now()) @db.Timestamptz

  super_admin Profile @relation(fields: [super_admin_id], references: [id])

  @@index([super_admin_id, created_at])
  @@index([target_type, target_id, created_at])
  @@index([action, created_at])
  @@map("super_admin_actions")
}

model ImpersonationSession {
  id             String    @id @default(uuid()) @db.Uuid
  super_admin_id String    @db.Uuid
  workspace_id   String    @db.Uuid
  profile_imp_id String    @db.Uuid              // usualmente el owner del workspace
  reason         String                          // obligatoria
  started_at     DateTime  @default(now()) @db.Timestamptz
  ended_at       DateTime? @db.Timestamptz
  expires_at     DateTime  @db.Timestamptz       // max 1h
  actions_taken  Int       @default(0)           // cuántas requests de escritura hizo
  ip_address     String?

  @@index([super_admin_id, started_at])
  @@index([workspace_id, started_at])
  @@map("impersonation_sessions")
}
```

---

## 3. Backend

### 3.1 Middleware `requireSuperAdmin`
Archivo: `apps/api/src/middleware/super.js`.

- Valida `request.user.is_super_admin === true`.
- Fase 7.4: exige claim `super_2fa_verified` en el JWT (otorgado solo al pasar TOTP).
- IP allowlist opcional via `SUPER_IP_ALLOWLIST` env.
- Logea cada invocación en `SuperAdminAction` con ip + user_agent.

### 3.2 Endpoints `/api/super/*`

| Grupo | Endpoint | Uso |
|---|---|---|
| **Métricas** | `GET /metrics` | MRR, ARR, conteos por status, churn 30d, tickets abiertos, pagos pendientes |
| | `GET /metrics/timeseries?range=30d\|90d` | MRR, signups, churn por día |
| **Workspaces** | `GET /workspaces?status=&plan=&q=&sort=&page=` | Tabla paginada con search |
| | `GET /workspaces/:id` | Detalle: sub, usage, últimas órdenes, tickets |
| | `POST /workspaces/:id/plan` | Body `{plan_code, expires_at?, note}` — asigna plan manual |
| | `DELETE /workspaces/:id/plan-override` | Vuelve a plan natural |
| | `POST /workspaces/:id/extend-trial` | `{days, reason}` |
| | `POST /workspaces/:id/suspend` / `/unsuspend` | `{reason}` |
| | `POST /workspaces/:id/partner-toggle` | is_partner on/off |
| | `POST /workspaces/:id/impersonate` | Devuelve JWT temporal 1h |
| | `POST /impersonate/end` | Cierra sesión impersonation |
| **Tickets super** | `GET /tickets?status=&assigned=&priority=&q=` | Inbox |
| | `GET /tickets/:id` | Detalle + mensajes + internos |
| | `POST /tickets/:id/reply` | `{body_md, is_internal}` |
| | `PATCH /tickets/:id` | status / priority / assignee / tags |
| | `POST /tickets/:id/macro/:shortcut` | Dispara macro (responder + asignar plan + resolver) |
| | `GET /canned-responses` / CRUD | Plantillas |
| **Users** | `GET /users?q=&super=&active=` | Cross-workspace |
| | `POST /users/:id/reset-password` | Email link one-time |
| | `POST /users/:id/deactivate` | |
| | `POST /users/:id/make-super` | Promueve (solo primario) |
| **Billing** | `GET /subscriptions?status=&source=` | Todas las subs |
| | `GET /payouts?status=` | Referral payouts |
| | `POST /payouts/:id/pay` | `{paid_via, reference, notes}` |
| | `POST /payouts/:id/skip` | |
| **Audit** | `GET /audit?target_type=&action=&from=&to=` | Global (combina audit_logs + super_admin_actions + billing_events) |
| | `GET /impersonations` | Historial |
| **Maintenance** | `POST /maintenance/run-payout-sweep` | Disparo manual |
| | `POST /maintenance/run-billing-sweep` | |
| | `POST /maintenance/prune-orphans` | Limpia signups fallidos |

### 3.3 Endpoints `/api/tickets/*` (cliente)

| Endpoint | Uso |
|---|---|
| `POST /api/tickets` | Cliente crea (subject, category, body, priority, adjuntos) |
| `GET /api/tickets` | Lista suyos (filtra por `created_by` + `workspace_id`) |
| `GET /api/tickets/:id` | Detalle (filtered: sin `is_internal=true`) |
| `POST /api/tickets/:id/reply` | Responder |
| `POST /api/tickets/:id/mark-read` | Resetear `customer_unread` |

Rate limit cliente: 10 tickets/h, 50 mensajes/h, 30MB/día adjuntos por workspace (usando `fastify-rate-limit`).

### 3.4 Notificaciones (outbound)

- **Email** via Resend (API key env `RESEND_API_KEY`): nuevo ticket → super; respuesta super → cliente; respuesta cliente → super asignado.
- **Slack webhook** (env `SLACK_SUPPORT_WEBHOOK_URL`): ticket nuevo → canal.
- **In-app**: badges de unread en sidebar.
- **Sweep 24h**: ticket `open` sin `first_response_at` tras 24h → eleva priority automáticamente + alerta email.

---

## 4. Frontend

### 4.1 Estructura de páginas

```
/super/login                 ← login separado (solo is_super_admin)
/super                       ← Dashboard (KPIs + listas rápidas)
/super/workspaces            ← Tabla filtrable
  /super/workspaces/:id      ← Detalle (3 tabs: general, suscripción, actividad)
/super/tickets               ← Inbox
  /super/tickets/:id         ← Conversación
/super/users                 ← Usuarios
/super/billing               ← Subscripciones + referral payouts
/super/audit                 ← Log global
/super/settings              ← Canned responses, Slack, 2FA, API keys

/admin/support               ← NUEVO (cliente): lista mis tickets
  /admin/support/new         ← Crear ticket
  /admin/support/:id         ← Conversación
```

### 4.2 Estilo "cockpit"

- **Dark-first** con acento `#ef4444` heredado del branding.
- Layout 2-paneles (sidebar + contenido) estilo Linear/Gmail.
- **MetricCard** grande en dashboard home: MRR / Workspaces / Tickets abiertos / Pagos pendientes / Trials vencen en 7d / Churn 30d.
- Tablas: sticky headers, search inline, filtros guardables, export CSV.
- Keyboard-first: `J/K` navega tickets, `R` responder, `A` asignar a mí, `E` resolver, `Cmd+K` command palette (salta a workspace por slug/email/nombre, a ticket por #, a páginas).
- **Banner rojo fijo** al impersonar: "Actuando como Taller Juárez — [Salir]".
- Skeleton loaders en vez de spinners.

### 4.3 Dashboard KPIs

**Fila superior (6 cards)**:
1. **MRR** — suma de subs activas pagantes (source=stripe o manual con `price_mxn_monthly>0`). Delta vs mes anterior.
2. **Workspaces activos** — split trial / pagante / flagship.
3. **Signups 7d** — nuevos workspaces.
4. **Tickets abiertos** — badge rojo si hay urgent >2h sin respuesta.
5. **Pagos referidos pendientes** — suma en MXN.
6. **Churn 30d** — % cancelaciones.

**Gráficos**:
- MRR timeline 90d (línea).
- Signups por día 30d (barras).
- Funnel: signup → onboarding completo → primera orden → primer pago.
- Heatmap tickets por hora (para saber cuándo estar atento).
- Tabla "Riesgo de churn": pagantes con 0 órdenes en 14d.

**Listas rápidas** (bottom):
- 10 últimos tickets abiertos.
- 5 trials que vencen en 7d (botón "Extender").
- 3 pagos de referidos mayores pendientes.

---

## 5. Seguridad

| Amenaza | Mitigación |
|---|---|
| Token super robado | 2FA TOTP obligatorio desde 7.4; JWT con claim `super_2fa_verified` separado del login |
| Impersonation abusada | Audit inmutable + banner rojo + reason obligatoria + max 1h + límite de escrituras por sesión |
| Cliente hace spam tickets | Rate limit 10/h tickets, 50/h mensajes, 30MB/día adjuntos |
| Adjuntos maliciosos | Whitelist MIME (pdf, png, jpg, webp, log, txt), tamaño max, rename server-side, no ejecutables |
| XSS en mensajes | Sanitizar con `dompurify` server-side; render markdown controlado, sin HTML raw |
| Sesión super robada | IP allowlist opcional; sesión 4h; refresh exige re-2FA |
| Super borra su rastro | API sin DELETE; triggers Postgres bloquean DELETE/UPDATE en `super_admin_actions` |
| Super futuro malicioso (empleado) | Cambio a is_super_admin=true auditado; solo el primario puede crear nuevos supers |

---

## 6. Fases de implementación

### **Fase 7.1 — Foundation (5-7 días)**
**Entregable**: Puedes entrar a `/super`, ver métricas reales, tabla de talleres, aplicar plan manual a cualquiera, extender trial, suspender.

Tareas:
- [ ] Schema: `is_super_admin`, `SuperAdminAction`, `ImpersonationSession`, `Subscription.source/manual_*`, `Workspace.suspended_*`.
- [ ] Seed: marcar `amaury.colochos7@gmail.com` como super al deploy.
- [ ] Middleware `requireSuperAdmin`.
- [ ] Rutas: `/api/super/metrics`, `/workspaces*`, `/users*`, `/audit`.
- [ ] Frontend shell `/super` con login separado, layout dark, sidebar.
- [ ] Páginas: Dashboard, Workspaces (tabla + detalle + acciones), Users, Audit.
- [ ] Acciones: assign-plan manual, extend-trial, suspend/unsuspend, partner-toggle.
- [ ] SuperAdminAction: registrar cada mutación con before/after.
- [ ] Fix Dockerfile (`;` → `&&`) para evitar bug repetido de hoy.

### **Fase 7.2 — Tickets core (5-7 días)**
**Entregable**: Cliente crea ticket desde `/admin/support`. Tú ves y contestas en `/super/tickets`. Emails bidireccionales.

Tareas:
- [ ] Schema: SupportTicket, TicketMessage, TicketAttachment.
- [ ] Rutas cliente: CRUD de tickets con rate limit.
- [ ] Rutas super: inbox + reply + patch (status/priority/assignee).
- [ ] Frontend cliente: `/admin/support` (lista), `/new` (form), `/:id` (timeline WhatsApp-style).
- [ ] Frontend super: `/super/tickets` (inbox filtros), `/:id` (conversación + adjuntos + assign + status).
- [ ] Adjuntos: usar infra de upload de fotos existente.
- [ ] Integración Resend: email al crear/responder. Templates básicos.
- [ ] Contadores unread (campaña dedicada en cliente y super).

### **Fase 7.3 — Tickets avanzado + payouts (5-7 días)**
**Entregable**: Soporte productivo (plantillas, macros). Gestión de pagos a referidos en UI.

Tareas:
- [ ] Canned responses: settings UI + shortcuts tipo `/qr-bot`, `/welcome-pro`.
- [ ] Macros: "Resolver + asignar Pro 30d gratis" = 1 clic dispara 3 acciones.
- [ ] Notas internas (`is_internal=true`) con color distinto.
- [ ] SLA tracking: `first_response_at`, `resolved_at`, tiempos promedio en dashboard.
- [ ] Sweep 24h: tickets sin respuesta → bump priority + alerta email.
- [ ] Rutas + UI de `/super/billing/payouts`: pendientes, mark-paid con form (método, referencia, notas).
- [ ] Impersonation completa: banner rojo + timer + endpoint end.
- [ ] Command palette Cmd+K (usar `cmdk` lib de shadcn o custom).
- [ ] Slack webhook wire-up.

### **Fase 7.4 — Seguridad + polish (5-7 días)**
**Entregable**: Panel production-grade, hardened.

Tareas:
- [ ] 2FA TOTP obligatorio (lib `otplib`, QR para Google Auth/Authy, códigos de recuperación).
- [ ] IP allowlist via env.
- [ ] Triggers Postgres: bloquear DELETE en `super_admin_actions` y `impersonation_sessions`.
- [ ] Gráficos timeseries 90d (MRR, signups, churn) usando Recharts.
- [ ] Exports CSV (workspaces, tickets, payouts).
- [ ] Heatmap tickets por hora del día.
- [ ] Funnel signup → primera venta (analytics desde audit_log).
- [ ] Saved filters en workspaces/tickets.
- [ ] Dark mode pulido + atajos documentados.
- [ ] Rate limits finos en `/api/tickets*`.

---

## 7. Cronograma

| Sub-fase | Días | Arranque (si OK hoy) | Cierre |
|---|---|---|---|
| 7.1 Foundation | 5-7 | 2026-04-19 | 2026-04-26 |
| 7.2 Tickets core | 5-7 | 2026-04-27 | 2026-05-03 |
| 7.3 Avanzado + payouts | 5-7 | 2026-05-04 | 2026-05-10 |
| 7.4 Seguridad + polish | 5-7 | 2026-05-11 | 2026-05-17 |

**Total: ~4 semanas** hasta producto completo.
**MVP (7.1 + 7.2): ~2 semanas** ya con valor operativo.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Migración Prisma rompe algo | Todos los campos son nullable o default; ningún DROP. `prisma db push --accept-data-loss` seguro. |
| Super pierde 2FA | Códigos de recuperación de 10 dígitos + procedimiento SSH documentado |
| Acción destructiva accidental | Confirmación "escribe CONFIRM NOMBRE-TALLER" + excepción: is_flagship NO suspendible |
| Audit log crece exponencial | Rotación trimestral a `super_admin_actions_archive_YYYY_QN` |
| Adjuntos llenan disco | Max 10MB archivo, 50MB ticket, 1GB/mes/workspace. Cuota al plan. |
| Cliente VIP con problema invisible | Dashboard destaca tickets de flagship/partner en badge especial |
| Dokploy CMD `;` silencia `db push` | Fix incluido en 7.1 (`;` → `&&`) |

---

## 9. Qué necesito del dueño (Amaury)

### 9.1 Decisiones (responder en chat)

| # | Pregunta | Opciones | Default |
|---|---|---|---|
| 1 | Subdominio del panel | A) `motopartes.cloud/super` / B) `admin.motopartes.cloud` | A |
| 2 | Email provider | A) Resend (3k gratis) / B) SMTP hosting / C) Skip emails por ahora | C para 7.1, A para 7.2 |
| 3 | Slack/Discord webhook | URL o vacío | Vacío |
| 4 | 2FA obligatorio | A) Desde 7.1 / B) Solo en 7.4 | B |
| 5 | Prioridad | A) 4 fases en orden / B) MVP 7.1+7.2 y luego vemos | A |
| 6 | Plantillas respuesta iniciales | Lista o "sugiéreme tú" | Sugiero 5 típicas |

### 9.2 Credenciales / accesos (ya tengo)

- **SSH**: `root@187.77.11.79` / `Jomoponse-1+` ✅
- **Dokploy panel**: `http://187.77.11.79:3000` / `admin@kingicegold.com.mx` / `KingIce2026!` ✅
- **Email super primario**: `amaury.colochos7@gmail.com` (confirmado por memoria)

### 9.3 Setup futuro a cargo del dueño

- **Si subdominio = B**: añadir CNAME `admin` → `motopartes.cloud` en Cloudflare/DNS. Lo indico cuándo.
- **Si Resend = A**: crear cuenta en resend.com (gratis), pegar API key cuando llegue 7.2.
- **2FA**: instalar Google Authenticator o Authy en el celular cuando llegue 7.4.

### 9.4 Tiempo tuyo durante el desarrollo

- **Cierre de 7.1** (día 7): 15-30 min para revisar link y aprobar.
- **Testing tickets** (mid 7.2): 15 min para flujo ida-vuelta.
- **Cierre de 7.3 y 7.4**: 15 min cada uno.

---

## 10. Presupuesto

| Concepto | Mensual | Anual |
|---|---|---|
| Resend (≤3k emails/mes) | $0 | $0 |
| Resend si >50k emails/mes | ~$400 MXN | ~$4,800 MXN |
| 2FA TOTP (Google Auth app) | $0 | $0 |
| Subdominio admin.motopartes.cloud | $0 | $0 |
| Storage adjuntos (volumen local) | $0 | $0 |
| Storage S3/B2 si crece >5GB | ~$50 MXN | ~$600 MXN |
| **ARRANQUE** | **$0** | **$0** |
| **6 meses con 50+ talleres** | **~$500 MXN** | **~$6,000 MXN** |

---

## 11. Próximo paso concreto

Arranco Fase 7.1 así que me respondas las 6 preguntas de §9.1. Orden de ejecución:

1. **Hoy (tras tu OK)**: en paralelo, responsive de la landing (2h) + schema nuevo Prisma + `prisma db push`.
2. **Día 2-3**: middleware super + primeros endpoints + login separado.
3. **Día 4-5**: tabla workspaces + detalle + acciones (assign-plan, extend-trial, suspend).
4. **Día 6**: dashboard de métricas + audit view + seed super-admin.
5. **Día 7**: deploy a producción, link de review, checklist de aceptación.

Una vez aprobada 7.1, arranco 7.2 el mismo día.

---

**Fin del plan. Esperando respuestas a §9.1 para arrancar.**
