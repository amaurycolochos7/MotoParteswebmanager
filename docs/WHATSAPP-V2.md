# WhatsApp V2: sesión única, cola, bandeja, equipo y comisiones

Documento técnico del lado servidor (API + bot). El contrato de rutas está en `docs/CONTRATO-V2.md`.

## Cómo funciona

### 1. Una sola sesión de WhatsApp por taller
- El bot guarda cada sesión con un id (`mechanicId`) que es el id de un `Profile`. Antes cada mecánico tenía la suya y el código escogía sesión de tres maneras distintas (la pantalla, las automatizaciones y las citas).
- Ahora el taller tiene UNA: `Workspace.whatsapp_session_profile_id`. `lib/wa-session.js` la resuelve (con respaldo a la sesión heredada si el taller aún no se migró) y es lo único que habla con el bot.
- Las rutas antiguas `/api/whatsapp-bot/*` siguen existiendo pero ignoran el id que manden y usan la sesión del taller. Administrar la sesión (QR, iniciar, cerrar) es solo owner/admin.
- Cambiar de número (eSIM nueva): en Ajustes de WhatsApp pulsar "Cerrar sesión" (`POST /api/whatsapp/logout`) y luego "Conectar" (`POST /api/whatsapp/start`) y escanear el QR con el número nuevo. El historial de conversaciones se conserva (es del taller, no del número).

### 2. Salida de mensajes y cola de reintentos
- TODO envío del servidor pasa por `sendToClient()` (`lib/wa-send.js`): citas, avisos a mecánicos, automatizaciones de orden, envíos del panel y la ruta antigua `send-message`. El ticket en PDF usa la misma sesión y deja constancia en la bandeja.
- Cada mensaje se registra primero en la bandeja (estado `queued`) y luego se intenta enviar.
- Si el bot está reconectando o caído (sin respuesta, 502/503/504, 5xx), el mensaje va a `WaOutbox` y un trabajador lo reintenta cada 15 s con espera creciente (15 s, 30 s, 1, 2, 4, 8 y 15 min) durante 30 minutos. Pasado ese tiempo queda `failed`.
- Si el fallo es definitivo (número no registrado en WhatsApp, petición mala) no se reintenta: queda `failed` de inmediato.
- Las automatizaciones dan el trabajo por hecho cuando el mensaje quedó en cola (no se reintenta dos veces).
- El trabajo de automatizaciones ahora se reclama de forma atómica por trabajo: dos pasadas simultáneas ya no pueden mandar el mismo mensaje dos veces.

### 3. Mensajes de orden sin duplicados
- El SERVIDOR es el único remitente. La pantalla debe dejar de enviar WhatsApp de orden creada y de cambio de estado (si no, el cliente recibe dos).
- `order.created` -> "Confirmación de ingreso". `order.status_changed` -> una automatización por estado con filtro `status_key` (el nombre del estado se normaliza: "En Reparación", "En reparacion" y "En proceso" son `en_proceso`).
- Estados con mensaje: en revisión (diagnóstico), autorizada, en proceso/reparación, esperando refacciones, lista, entregada, cancelada, y cotización. Cualquier otro estado ("Garantía", "Esperando autorización del cliente"...) NO manda mensaje (antes mandaba uno genérico); se puede crear una automatización propia en Automatizaciones.
- Cada automatización tiene `dedup_per_order`: una vez por orden. El evento solo se dispara si el estado realmente cambió.
- Los textos son plantillas editables en Plantillas. Variable nueva `{atiende}` ("Te atiende: nombre (WhatsApp 961 123 4567)", vacía si la orden no tiene mecánico).

### 4. Bandeja "Conversaciones"
- El bot (`apps/whatsapp-bot/src/inbox-events.js`, enganchado en `WhatsAppSession.js`) reenvía a `POST /api/internal/wa/event` (header `x-api-key`) los mensajes entrantes (`message`), los salientes (`message_create` con `fromMe`) y los acuses (`message_ack`). Ignora grupos, estados y avisos del sistema. Una falla al avisar a la API solo se registra: nunca rompe la sesión.
- La API guarda en `wa_conversations` / `wa_messages` / `wa_media`, enlaza con el cliente por teléfono (10 dígitos y variantes de lada) y cuenta no leídos. Los mensajes enviados por el sistema o el panel se registran antes y el evento del bot se une a ese registro (no se duplica).
- Origen de cada mensaje: `client`, `phone` (escrito en el teléfono del taller), `panel` (persona, con su nombre), `auto` (sistema).
- Imágenes: se guardan en la base hasta 2 MB y se borran a los 30 días. Otros archivos aparecen como etiqueta ("[Nota de voz]", "[Documento]").
- Empieza a llenarse desde que el bot se despliega; no importa chats anteriores.
- Acceso: owner, admin, maestro, o un auxiliar/mecánico con `Membership.permissions.can_view_inbox = true`. Ocultar una conversación la quita de la lista y reaparece si el cliente vuelve a escribir.

### 5. Equipo, permisos y comisiones
- Roles normalizados (`lib/permissions.js`): owner, admin, maestro (mecánico con `is_master_mechanic`), mecánico, auxiliar. Los datos existentes no se migran: el rol se calcula de `Membership.role` + banderas del perfil.
- `/api/team`: el admin crea cualquier rol; el maestro solo crea auxiliares a su cargo, con comisión hasta el tope (`Workspace.settings.aux_commission_cap`, 40 % por defecto, editable por el admin). Tampoco puede editar ni borrar auxiliares ajenos.
- Las rutas antiguas de usuarios, solicitudes de auxiliares, pagos a auxiliares y ganancias se cerraron: lista blanca de campos, alcance por rol, perfil de otro solo si es del mismo taller, sin secretos 2FA en las respuestas.
- Comisiones (`lib/commissions.js`): el cálculo que estaba duplicado en dos bloques de `orders.js` quedó en un solo lugar, con la misma matemática (sobre la mano de obra; el auxiliar con supervisor se reparte con su maestro). `GET /api/earnings/summary` devuelve lo que de verdad corresponde (por cobrar, liberada, pagada), no la mano de obra completa.

## Migraciones (corren solas al arrancar la API; son idempotentes)
1. `prisma db push` (el Dockerfile ya lo ejecuta): agrega `workspaces.whatsapp_session_profile_id` y las tablas `wa_conversations`, `wa_messages`, `wa_media`, `wa_outbox`, más índices en `motorcycles`/`appointments`. Todo aditivo, no borra nada.
2. `lib/startup-migrations.js`:
   - Sesión única: a cada taller sin `whatsapp_session_profile_id` le asigna la sesión de WhatsApp que ya tenía conectada (la de un integrante del taller; prefiere la conectada). No pide QR de nuevo y no toca el bot.
   - Mensajes por defecto: solo para talleres que ya usan WhatsApp. Crea (activadas) las plantillas y automatizaciones de orden que falten. Si ya existen y NADIE las editó (`updated_at` ≈ `created_at`) y estaban apagadas, las activa. Una plantilla solo se mejora (para agregar `{atiende}`) si su texto es exactamente el anterior por defecto. Nunca pisa plantillas editadas ni reactiva automatizaciones que alguien apagó.
   - El log lo deja así: `[migraciones] listo: {"sessions_assigned":N,"defaults":{"<taller>":{...}}}`. Una segunda corrida debe dar ceros (el e2e lo comprueba).
3. Limpieza diaria de imágenes de la bandeja con más de 30 días.

Variables de entorno (todas opcionales, con valor por defecto): `API_INTERNAL_URL` del bot (por defecto `http://api:3000`, sirve tal cual en docker compose), `WA_READY_TIMEOUT_MS` del bot (por defecto 180000), `PANEL_URL` de la API (por defecto `https://motopartes.cloud`).

### Cambio en el bot: "ready_timeout" de 60 s a 180 s
Tras el último despliegue el bot tardó unos 3 minutos y medio en quedar listo porque el reloj de 60 s reiniciaba la sesión en bucle (autenticaba a los pocos segundos, pero la carga de WhatsApp Web superaba el minuto, el reloj la mataba y la siguiente carga volvía a empezar). Con 180 s se espera lo suficiente para que una carga normal termine. Riesgo: una sesión realmente atascada tarda hasta 3 min en reiniciarse sola (antes 1 min). Si hace falta se ajusta con `WA_READY_TIMEOUT_MS` sin tocar código.

## Qué verificar en producción después del despliegue
1. Respaldo previo: `pg_dump` de la base antes de subir.
2. Log de la API: línea `[migraciones] listo:` con `sessions_assigned` = 1 (o 0 si ya estaba) y sin errores.
3. Base de datos: `select id, whatsapp_session_profile_id from workspaces;` -> el taller de producción apunta al perfil de Elihu (la sesión que estaba conectada). `select name, enabled from automations where is_default order by name;` -> "Confirmación de ingreso", "Lista para recoger" y los `Estado: ...` activos.
4. Panel > WhatsApp del taller (cuando B lo termine) o `GET /api/whatsapp/status`: conectado, con el número actual. El bot tarda unos minutos en reconectar tras el despliegue (ahora hasta 3 min antes de reiniciar solo); durante ese rato los mensajes quedan en cola y salen solos.
5. Crear una orden de prueba y cambiarla de estado: debe llegar UN mensaje por evento. Si llegan dos, el frontend viejo sigue enviando por su cuenta (falta quitar los `sendDirectMessage`).
6. Mandar un mensaje desde Conversaciones y responder desde el teléfono: ambos aparecen. Escribir al número del taller desde otro teléfono: aparece como no leído (esto solo se puede comprobar con WhatsApp real; las pruebas usan un bot falso).
7. `select status, count(*) from wa_outbox group by status;` -> sin `pending` acumulados. `failed` solo si hubo números inexistentes o caídas de más de 30 min.
8. Roles: `GET /api/team/me` con un maestro, un mecánico y un auxiliar (con y sin casilla de bandeja) devuelve los permisos esperados.
9. Cambio de número a la eSIM: Ajustes > WhatsApp > Cerrar sesión > Conectar > escanear. Probar enviar un mensaje de prueba y que el historial siga.

## Límites conocidos (honestos)
- Los manejadores del bot (`inbox-events.js`) se probaron con funciones puras y con un bot falso hablando con la API, NO con una sesión real de WhatsApp. Casos a vigilar al principio: contactos que WhatsApp identifica como `@lid` (se usa el número del contacto si el bot lo obtiene; si no, la conversación queda con el id numérico), y mensajes con formato raro.
- Las imágenes pesadas (>2 MB) y otros archivos no se guardan; solo queda la etiqueta.
- La bandeja no importa chats anteriores al despliegue.
- El tope de comisión de auxiliares solo limita a los maestros; el admin puede fijar hasta 100 %.
- La "campanita" de citas usa `attention-count`/`inbox` por consulta (sin tiempo real); el panel debe consultar cada pocos segundos.

## Reversa
- Todo cambio de esquema es aditivo: volver al código anterior no rompe nada (las tablas nuevas simplemente no se usan).
- Si el nuevo comportamiento de mensajes molesta, apagar las automatizaciones `Estado: ...` en Automatizaciones deja el taller sin avisos de estado sin tocar código.
