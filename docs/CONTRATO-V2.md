# Contrato V2: WhatsApp único, equipo, bandeja, comisiones, citas

Documento de coordinación entre el trabajo de BACKEND (apps/api, apps/whatsapp-bot) y FRONTEND (apps/frontend).
Todas las rutas llevan JWT (`Authorization: Bearer`) y están acotadas al taller activo (multi-tenant), salvo las marcadas `interno`.
Roles de la API: `owner`, `admin`, `maestro`, `mecanico`, `auxiliar` (ver "Roles"). Errores: `{ "error": "mensaje en español" }`.

## Decisiones del usuario (fijas)
- UN solo número de WhatsApp para todo el taller. Todos los mensajes salen de esa sesión. Sin sesiones por usuario.
- Solo el SERVIDOR envía los mensajes automáticos de orden/cita (la pantalla deja de enviarlos). Textos editables en Plantillas.
- Tres roles visibles: Dueño/Administrador, Mecánico (con casilla "puede aprobar auxiliares" = maestro), Auxiliar.
- El maestro crea sus auxiliares y fija su % de comisión dentro de un tope (por defecto 40 %, configurable por el admin).
- Bandeja "Conversaciones": la ven owner/admin y maestros; un auxiliar solo si se marcó `can_view_inbox` al crearlo.
- La sesión de WhatsApp que ya está conectada se conserva (se convierte en la del taller, sin volver a escanear QR). Más adelante se cambiará por la eSIM nueva cerrando esa sesión y conectando la otra.
- Sin emojis en textos nuevos de la interfaz. Todo en español.

## Roles (vista normalizada)
| role API | origen en BD |
|---|---|
| owner | Membership.role = owner |
| admin | Membership.role = admin |
| maestro | Membership.role = mechanic y Profile.is_master_mechanic = true |
| mecanico | Membership.role = mechanic y no maestro y no requires_approval |
| auxiliar | Membership.role = auxiliary o Profile.requires_approval = true |
Permisos efectivos: owner/admin = todo. Se resuelven en `apps/api/src/lib/permissions.js` (`effectivePermissions(membership, profile)`), única fuente de verdad.

## Equipo
`GET /api/team` -> `[{ id, full_name, email, phone, role, is_active, commission_percentage, supervised_by, supervisor_name, can_view_inbox, online_booking_visible, permissions:{can_create_appointments,can_send_messages,can_create_clients,can_create_services,can_edit_clients,can_delete_orders,can_view_approved_orders}, orders_count, created_at }]`
- owner/admin: todo el taller. maestro: él mismo + sus auxiliares. Otros: 403.
`POST /api/team` body `{ full_name, email, password, phone, role: 'admin'|'maestro'|'mecanico'|'auxiliar', commission_percentage, supervised_by?, can_view_inbox?, permissions? }`
- admin crea cualquier rol. maestro SOLO `auxiliar` con `supervised_by = él` y `commission_percentage <= tope` (400 si lo pasa).
`PUT /api/team/:id` mismos campos (admin: cualquiera; maestro: solo sus auxiliares). `PATCH /api/team/:id/active {active:boolean}`.
`DELETE /api/team/:id` (quita del taller). `DELETE /api/team/:id/permanent` (solo owner; no permite borrar al último owner).
`GET /api/team/settings` -> `{ aux_commission_cap: number }` ; `PUT /api/team/settings {aux_commission_cap}` (solo admin/owner).
Se conserva `PATCH /api/auth/users/:id/online-booking`.

## WhatsApp del taller (sesión única)
Sesión del taller = `Workspace.whatsapp_session_profile_id` (el profile cuyo id se usa como `mechanicId` en el bot). Migración idempotente al arrancar la API: si es null y existe un `WhatsappSession` conectado del taller, se asigna ese.
`GET /api/whatsapp/status` (owner/admin/maestro) -> `{ configured, connected, state: 'connected'|'connecting'|'qr'|'disconnected', phone_number, connected_at, qr_data_url|null }`
`POST /api/whatsapp/start` (owner/admin) inicia la sesión del taller y deja el QR disponible en `status`.
`POST /api/whatsapp/logout` (owner/admin) cierra la sesión (para cambiar de número).
`POST /api/whatsapp/send` (permiso `can_send_messages`) body `{ phone, message, order_id? }` -> `{ success, queued }`. Envía por la sesión del taller y registra el mensaje en la conversación (origin `panel`, sent_by = usuario).
Todo envío del servidor pasa por `lib/wa-send.js` (`sendToClient(workspaceId, phone, text, ctx)`): resuelve la sesión única, registra en la bandeja (origin `auto`) y, si falla, deja el mensaje en la COLA `WaOutbox` (reintentos con espera creciente durante 30 min).
Las rutas antiguas `/api/whatsapp-bot/*` siguen existiendo pero SIEMPRE resuelven a la sesión del taller (el id que manden se ignora).

## Mensajes automáticos (solo servidor)
- `order.created`: "Confirmación de ingreso" (una sola vez por orden, con `{atiende}`).
- `order.status_changed`: una plantilla por estado (En revisión, Autorizada, En reparación, En proceso, Esperando refacciones, Lista, Entregada), una vez por (orden, estado). Plantillas por defecto en `seed-automation-defaults.js`, editables en Plantillas. La migración de arranque crea/activa las del taller si faltan y NO pisa las que el usuario ya editó.
- La pantalla NO envía mensajes de orden ni de cambio de estado. Quedan solo los envíos manuales explícitos (botón "Enviar por WhatsApp", ticket) vía `/api/whatsapp/send` o `/api/orders/:id/ticket/whatsapp`.

## Bandeja (Conversaciones)
Acceso: owner, admin, maestro, o auxiliar con `can_view_inbox`.
`GET /api/inbox/conversations?q=&unread=1&limit=30&cursor=` -> `{ items:[{ id, phone, display_name, client:{id,full_name}|null, last_message_preview, last_message_at, last_direction, unread_count }], next_cursor }`
`GET /api/inbox/conversations/:id` -> `{ id, phone, display_name, client:{id,full_name,phone, motorcycles:[{id,brand,model,year,plates}], open_orders:[{id,order_number,status,motorcycle}], upcoming_appointments:[{id,scheduled_date,status,service_type}] }|null }`
`GET /api/inbox/conversations/:id/messages?before=<iso>&limit=40` -> `{ items:[{ id, direction:'in'|'out', origin:'client'|'phone'|'panel'|'auto', body, media:{id,type,mime}|null, status:'queued'|'sent'|'delivered'|'read'|'failed', sent_by:{id,full_name}|null, created_at }] }` (orden cronológico ascendente dentro de la página)
`POST /api/inbox/conversations/:id/messages { text }` -> el mensaje creado (se envía por la sesión del taller).
`POST /api/inbox/conversations/:id/read`  `POST /api/inbox/conversations/:id/hide` (oculta, reaparece si escriben).
`GET /api/inbox/unread-count` -> `{ count }` (para la campanita).
`GET /api/inbox/updates?since=<iso>` -> `{ conversations:[...mismos items], now:<iso> }` (el panel hace polling cada 4 s).
`GET /api/inbox/media/:id` -> binario (imagen) con control de acceso.
`POST /api/internal/wa/event` (interno, header `x-api-key` del bot) eventos del bot: `{ workspaceSessionId, type:'message'|'ack', direction, from, to, body, wa_message_id, timestamp, media?:{mime,base64}, ack? }`. Ignora grupos y estados (`@g.us`, `status@broadcast`). Las imágenes se guardan en BD con tope 2 MB y retención de 30 días.
Modelos: `WaConversation`, `WaMessage`, `WaMedia`, `WaOutbox` (ver schema).

### CRM: chats por maestro, adjuntos y foto de perfil
Un solo número del taller; los chats se reparten entre los maestros (`WaConversation.assigned_to`). Los items de la lista y la ficha traen `assigned_to:{id,full_name,manual}|null` y `avatar` (id de la copia de la foto, sirve de versión de caché; `null` = sin foto).
**Quién atiende un chat** (`lib/wa-assign.js`, la primera regla que aplique): a mano (`assigned_manually`, nunca se toca) > mecánico de la orden abierta del cliente > mecánico de su próxima cita > quien respondió desde el panel por última vez (un dueño/admin que contesta NO se queda el chat) > mecánico de su última orden > mecánico preferido del cliente. Si es un auxiliar, queda a cargo de su maestro (`supervised_by`). Se recalcula al arrancar la API y al consultar la lista (máx. cada 45 s por taller); quien contesta un chat sin responsable se lo queda al instante.
`GET /api/inbox/sections` -> `{ me:{id,role}, own_ids:[...], can_assign, all:{total,unread}, none:{...}, mine:{...}, masters:[{id,full_name,avatar_url,role,total,unread}], assignable:[{id,full_name}] }`. Un dueño/admin recibe todos los maestros; los demás solo su propia sección (un auxiliar, la de su maestro).
`GET /api/inbox/conversations?owner=all|me|none|<profileId>` filtra por responsable (`me` = los míos). Pedir la sección de OTRO maestro sin ser dueño/admin -> 403; `all` (todos los chats) lo ve cualquiera con acceso a la bandeja.
`POST /api/inbox/conversations/:id/assign { profile_id }` (owner/admin/maestro) pasa el chat a un integrante del taller (queda manual); `profile_id: null` quita la asignación manual y vuelve a asignarse solo.
`POST /api/inbox/conversations/:id/attachment { file_base64, mime, name, caption?, as_document? }` -> el mensaje creado. Foto (jpeg/png/webp/gif) o video mp4/mov/3gp se mandan como tal; cualquier otro archivo, como documento. Máx. 12 MB. El texto guardado es `[Imagen] pie`, `[Video] pie` o `[Documento] pie` (igual al que reporta el bot, para no duplicar).
`GET /api/inbox/conversations/:id/avatar` -> imagen (404 si no tiene); `POST .../avatar/refresh` la vuelve a pedir ahora. La foto se pide al bot en segundo plano (`POST /sessions/:id/profile-pic { chatId }` -> `{data,mime}|{none:true}|{error}`), de una en una, y se revisa de nuevo cada 7 días.
Bot: `POST /send-file { mechanicId, chatId, base64, mimetype, filename, caption, asDocument }`.

## Separación por mecánico
Cada mecánico/maestro ve **solo lo suyo**; las excepciones compartidas son **los clientes** (lista, búsqueda e historial del cliente) y **WhatsApp** (Conversaciones). Se aplica en el servidor (`lib/visibility.js`), no en las pantallas:
- owner/admin: todo el taller · maestro: lo suyo + lo de sus auxiliares directos (`supervised_by`) · mecánico/auxiliar: solo lo suyo.
- **Órdenes** (mecánico asignado o aprobador), **cotizaciones** (quien las creó), **citas** (mecánico asignado), con todo lo que cuelga de ellas: cobros, fotos, avances, PDF, tickets. Una ruta con un id ajeno responde **404** (no 403: no se revela que existe).
- `GET /orders`, `/quotations`, `/appointments`, `/photos`, `/order-updates`, `/stats/*` y `/tasks` ya llegan filtrados. Quien no es dueño/administrador y crea una orden sin mecánico (o asignada a alguien fuera de su equipo) la deja a su nombre.
- Siguen compartidos: `GET /orders/client/:id` (historial del cliente), clientes, `/inbox/*`, días sin servicio.

## Comisiones
`GET /api/earnings/summary?mechanicId=&period=week|month|all` (cada quien su propio resumen; admin/maestro pueden pedir de otros dentro de su alcance) ->
`{ rate, period_start, period_end, orders_count, por_cobrar, liberada, pagada, total_comision, labor_total, items:[{ order_id, order_number, date, labor_amount, commission_rate, earned_amount, commission_status }] }`
- `por_cobrar` = PENDING_PAYMENT, `liberada` = READY_TO_PAY, `pagada` = PAID. Montos como número (MXN). El cálculo vive en `lib/commissions.js` (un solo lugar; orders.js lo usa en los dos sitios actuales).
- El inicio muestra `total_comision` y su desglose, NO la mano de obra completa.

## Citas
`GET /api/appointments/inbox` -> `{ pending:[cita], today:[cita], upcoming:[cita], counts:{pending,today,upcoming} }` para el usuario actual (mecánico/maestro/auxiliar: solo las suyas; admin/owner: todas). `cita` = forma de `GET /api/appointments/:id` (con client, motorcycle, mechanic, public_link, events).
`GET /api/appointments/attention-count` -> `{ count, mine }` (`mine` = pendientes asignadas al usuario actual; la campanita usa `mine` o `count` según rol).
Acciones existentes: `/accept`, `/propose`, `/reject`, `/cancel`, `/seen`.

## Frontend: piezas esperadas
Sistema de diseño base (tokens + componentes), menú reagrupado, Inicio con comisión real, Nueva orden en una sola pantalla, Detalle de orden en dos columnas, Equipo (reemplaza Usuarios), Ajustes de WhatsApp del taller, Conversaciones (bandeja + ficha del cliente), Citas con bandeja y campanita animada.

## Cambios (Agente A, backend) - leer antes de integrar

Esquema aplicado en la BD local (tablas `wa_conversations`, `wa_messages`, `wa_media`, `wa_outbox` + `Workspace.whatsapp_session_profile_id`). El cliente Prisma ya tiene los modelos.

Rutas nuevas o ampliadas respecto al contrato:
- `GET /api/team/me` -> `{ id, role, workspace_id, can_view_inbox, can_manage_team, can_create_auxiliares, can_approve_auxiliares, can_manage_whatsapp, can_see_whatsapp_status, can_see_money, permissions:{...}, supervised_by, aux_commission_cap }`. Usarla para armar el menú por rol (no pedir `/api/inbox/*` si `can_view_inbox` es false: devuelve 403).
- `GET /api/whatsapp/status` agrega `pending_messages` (mensajes en cola de reintentos) y `last_error`. Permiso: owner/admin/maestro.
- `POST /api/whatsapp/send` -> `{ success:true, queued:false, messageId }` o `{ success:true, queued:true, reason }` (el bot reconectaba: el mensaje sale solo) o 502 `{ success:false, error }`.
- `POST /api/team` responde 201 con la fila `GET /api/team`. `PUT /api/team/:id` devuelve la fila actualizada. `DELETE /api/team/:id` devuelve `{ success, deactivated, orphan_auxiliaries }`.
- `GET /api/appointments/inbox` -> `{ pending, today, upcoming, counts }` (cada cita con `client`, `motorcycle`, `mechanic{id,full_name,phone}`, `events`, `public_link`). `GET /api/appointments/attention-count` -> `{ count, mine }`.
- Eventos de cita nuevos en `events[].type`: `wa_queued` (mensaje en cola, saldrá al reconectar). `mechanic_notified` también se usa cuando el aviso quedó en cola. Se conserva `wa_failed` para fallos definitivos.
- Mensajes de la bandeja: `status` pasa por `queued -> sent -> delivered -> read` (o `failed`). `origin`: `client` (cliente), `phone` (escrito desde el teléfono del taller), `panel` (persona desde el panel), `auto` (sistema).

Comportamiento que el frontend debe asumir:
- La pantalla YA NO debe enviar WhatsApp de orden creada ni de cambio de estado: lo hace el servidor (automatizaciones `Confirmación de ingreso` y `Estado: ...`). Quitar los `sendDirectMessage` de `NewServiceOrder.jsx`, `OrderDetail.jsx` (cambio de estado) y `MasterRequests.jsx`. Los envíos manuales (botón "Enviar por WhatsApp", resumen) deben usar `POST /api/whatsapp/send`.
- Rutas heredadas `/api/whatsapp-bot/*`: ignoran el id de mecánico y usan la sesión del taller; `qr/start/logout` solo owner/admin; `send-message` pasa por la bandeja y la cola.
- `GET /api/auth/users` ya no devuelve secretos y, para mecánico/auxiliar, oculta correo, teléfono y comisión de los demás.
- `PUT /api/auth/users/:id` solo acepta campos permitidos según rol (nombre, teléfono, etc.); para crear/editar equipo usar `/api/team`.
- `GET /api/earnings` sin `mechanicId` devuelve solo lo propio para quien no es owner/admin; `POST/PUT mark-paid` exigen owner/admin/maestro.
- `POST /api/order-requests`: `requested_by` siempre es quien llama y `requested_to` debe ser un maestro/administrador del taller.
