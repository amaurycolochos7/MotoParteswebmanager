# Impresión de tickets — contrato de la API

Fuente de verdad para los tres componentes: **API** (`apps/api`), **panel web** (`apps/frontend`)
y **agente de Windows** (`apps/print-agent`). Si algo cambia, se cambia aquí primero.

Flujo: el panel (o el cierre de orden) pide imprimir → la API arma el ticket en **ESC/POS**
y lo deja en la cola (`PrintJob`) → el agente (laptop Windows en el taller) pregunta cada 3 s
→ recibe el trabajo → lo manda a la impresora por USB → confirma el resultado.

## Ajustes (`workspace.settings.print`)

Se leen/guardan con `GET/PUT /api/print/settings`. Todos opcionales; la API mezcla con estos valores por defecto:

| Campo | Tipo | Defecto | Uso |
|---|---|---|---|
| `business_name` | string | nombre del taller | Encabezado |
| `tagline` | string | `""` | Segunda línea del encabezado (ej. "Taller de motocicletas") |
| `address` | string | `""` | Dirección (máx. 2 líneas) |
| `phone` | string | `""` | Teléfono del taller |
| `footer` | string | `"Gracias por su preferencia"` | Mensaje final |
| `warranty_enabled` | bool | `true` | Imprime el bloque de garantía |
| `warranty_days` | int | `15` | Días de vigencia (se imprime la fecha de vencimiento) |
| `warranty_text` | string | `""` | Si está vacío se usa el texto estándar (ver abajo) |
| `paper_cols` | `48` \| `32` | `48` | 48 = papel de 80 mm, 32 = papel de 58 mm |
| `accents` | bool | `false` | `true` imprime á é í ó ú ñ (código CP850). `false` los quita: es lo más seguro |
| `show_qr` | bool | `true` | QR de seguimiento de la orden |
| `show_mechanic` | bool | `true` | Línea "Atendió" |
| `copies` | int 1–3 | `1` | Copias por ticket |

Texto estándar de garantía (ya sin acentos; la API lo adapta si `accents=true`):

```
GARANTIA: 15 dias naturales desde la entrega.
Vence el dd/mm/aaaa. UNICAMENTE en mano de obra.
Refacciones y piezas electricas
NO tienen garantia.
```

## Panel web → API (JWT + workspace; header `Authorization: Bearer`, `x-workspace-id`)

Prefijo `/api/print`. "Admin" = rol `owner` o `admin` del workspace.

| Método y ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|
| `GET /settings` | miembros | — | `{ settings, agent, queue }` (abajo) |
| `PUT /settings` | admin | parcial de los ajustes | `{ settings }` |
| `POST /agent-key` | admin | — | `{ key, agent }` — **`key` solo se ve una vez**. Revoca la anterior |
| `DELETE /agent-key` | admin | — | `{ ok: true }` |
| `GET /orders/:orderId/preview` | miembros | — | `{ text, cols }` — ticket en texto plano para mostrar en pantalla |
| `POST /orders/:orderId/ticket` | miembros | `{ copies?: 1..3 }` | `201 { job, agent_connected }` |
| `POST /orders/:orderId/ticket/whatsapp` | miembros | — | igual que `/api/order-pdf/:id/send`: `{ success, automated, fallback?, error?, botStatus? }` |
| `GET /sample` | miembros | — | `{ text, cols }` — ticket de ejemplo con los ajustes guardados (vista previa en la pantalla de ajustes) |
| `POST /test` | admin | — | `201 { job, agent_connected }` (ticket de prueba) |
| `GET /jobs?limit=30&order_id=` | miembros | — | `{ jobs: Job[] }` |
| `POST /jobs/:id/reprint` | miembros | — | `201 { job }` (copia nueva en `pending`) |
| `POST /jobs/:id/cancel` | miembros | — | `{ job }` (solo si estaba `pending`) |

Formas:

```ts
Agent = { id, name, key_prefix, last_seen_at, printer_name, agent_version, connected: boolean } | null
// connected = last_seen_at hace menos de 15 s
Queue = { pending: number, printing: number, failed: number }
Job = { id, order_id, kind: 'ticket'|'test', status: 'pending'|'printing'|'printed'|'failed'|'cancelled',
        copies, attempts, error, title, created_at, printed_at }
```

Errores: `{ error: string }` con 400/403/404. Si no hay agente conectado, `POST …/ticket` igual
**encola** (201) y devuelve `agent_connected: false` para que el panel avise "se imprimirá cuando la
laptop se conecte".

## Agente → API (clave del agente, **sin JWT**)

Header: `x-print-key: mpp_…`. Prefijo `/api/print-agent`. Clave inválida o revocada → `401 { error }`.

### `GET /api/print-agent/ping`
Comprueba que la clave sea válida (lo usa el asistente de instalación). No reclama trabajos. Respuesta `{ "ok": true }`; clave mala → `401`.

### `GET /api/print-agent/poll?version=1.0.0&printer=NOMBRE`
Latido + reclama el siguiente trabajo. Se llama cada ~3 s.

```json
{ "job": null }
```
```json
{ "job": { "id": "uuid", "kind": "ticket", "copies": 1, "title": "MP-26-099 · Juan Perez",
           "attempts": 1, "payload_b64": "<bytes ESC/POS en base64>" } }
```
Al reclamar, el trabajo pasa a `printing` y `attempts` sube 1. Si un trabajo se queda en `printing`
más de 60 s (el agente se cayó) vuelve a `pending`. Tras 5 intentos fallidos queda `failed`.

### `POST /api/print-agent/jobs/:id/result`
```json
{ "ok": true }
{ "ok": false, "error": "Impresora sin papel o apagada" }
```
Respuesta `{ ok: true }`. Si `ok=false` y quedan intentos, el trabajo vuelve a `pending` con
espera creciente (15 s × intentos); si no, `failed`.

El agente **imprime `copies` veces el mismo `payload_b64`** (la API no lo duplica).
