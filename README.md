# MotoPartes

SaaS de gestión para talleres mecánicos de motocicletas.
Producción: [motopartes.cloud](https://motopartes.cloud)

## Estructura

Monorepo con tres aplicaciones independientes:

| App | Ruta | Stack | Puerto local |
|---|---|---|---|
| Frontend | `apps/frontend/` | React 19 + Vite 7 + React Router 7 | 5173 |
| API | `apps/api/` | Fastify 5 + Prisma 6 + PostgreSQL 16 | 3000 |
| WhatsApp bot | `apps/whatsapp-bot/` | Express 5 + whatsapp-web.js (Puppeteer/Chromium) | 3002 |

Producción corre en un servidor casero (`servermacs`, Ubuntu + Docker Compose) y se publica con un túnel de Cloudflare: `motopartes.cloud` → `frontend:3000` (nginx, que hace proxy de `/api` y `/api/whatsapp-bot`) y `vc.motopartes.cloud` → `landing-vc`.

## Desarrollo local

### Prerrequisitos
- Docker + Docker Compose
- Node.js 20+ (solo si quieres correr tests o la UI fuera de Docker)

### Arranque

```
cp .env.example .env        # los valores por defecto ya funcionan en local
docker compose up -d --build
```

Listo:
- Frontend: http://localhost:5173
- API: http://localhost:3000/api/health
- Bot: http://localhost:3002/health
- Landing: se sirve solo dentro de la red de Docker (en producción por `vc.motopartes.cloud`)

Para parear WhatsApp en local, entra al frontend, inicia sesión, ve a `/mechanic/whatsapp`, y escanea el QR desde el teléfono del mecánico de prueba.

### Semillas de datos

`apps/api/prisma/seed.js` carga catálogo inicial de servicios y un usuario admin. Corre con:

```
docker compose exec api npm run db:seed
```

### Tests

El API tiene tests unitarios con el runner nativo de Node:

```
cd apps/api && npm install && npm test
```

## Documentación interna

- [`ULTRA_PLAN.md`](ULTRA_PLAN.md) — hoja de ruta completa hacia SaaS multi-tenant (6 fases).
- `.claude/` — notas de memoria del asistente (nunca comitear `settings.local.json`).

## Despliegue

**Push a `main` → el servidor se actualiza solo.** En el servidor corre un cron (cada minuto) que ejecuta [`scripts/deploy.sh`](scripts/deploy.sh):

1. `git fetch`; si `origin/main` no trae commits nuevos, no hace nada.
2. `git reset --hard origin/main` y `docker compose --profile tunnel up -d --build` (solo reconstruye lo que cambió).
3. Espera a que API, bot y frontend respondan `/health`.
4. Si algo no queda sano, vuelve al commit anterior (rollback) y no reintenta ese commit en bucle.

Comandos útiles desde tu PC (alias `servermacs` en `~/.ssh/config`):

```
ssh servermacs "~/MotoParteswebmanager/scripts/deploy.sh --force"   # desplegar ya
ssh servermacs "tail -50 ~/motopartes-deploy.log"                   # ver historial de deploys
ssh servermacs "cd ~/MotoParteswebmanager && docker compose ps"     # estado de servicios
```

Instalación del cron (una sola vez en el servidor): `scripts/install-autodeploy.sh`.

**Configuración que NO está en git** (vive en `~/MotoParteswebmanager/.env` del servidor): `DB_PASSWORD`, `JWT_SECRET`, `WHATSAPP_API_KEY`, `CORS_ORIGINS`, `TUNNEL_TOKEN`. Ver `.env.example`. Rotar `JWT_SECRET` invalida todas las sesiones vigentes.

**nginx**: `apps/frontend/nginx.conf.template` es una plantilla; el destino de la API (`API_UPSTREAM`, `API_PORT`) sale de variables de entorno con defaults para docker compose. `/api/whatsapp-bot/*` NO tiene location propio: la API lo reenvia al bot. No poner URI en `proxy_pass` cuando se usan variables (rompe `/api/auth/login`).

## Panel de estado del servidor

Servicio `server-monitor` (`apps/server-monitor/`): panel **genérico y de solo lectura** del equipo (no depende de la app). Muestra CPU (uso por núcleo, frecuencia, carga, presión), memoria y swap, disco (espacio, inodos, E/S por dispositivo), red (tráfico, interfaces, conexiones TCP y puertos en escucha), temperatura y límite térmico, batería/corriente, procesos que más consumen e historial (15 min · 1 h · 24 h · 7 días). Tema claro/oscuro y adaptado a teléfono.

- Servidor: `http://IP-DEL-SERVIDOR:8088` (p. ej. por Tailscale `http://100.88.47.41:8088`). `MONITOR_BIND` del `.env` define la interfaz (`0.0.0.0` en el servidor, `127.0.0.1` por defecto).
- Corre con `pid: host` y `network_mode: host` para ver procesos y red reales, pero sin privilegios: usuario no-root, sistema de archivos de solo lectura, sin capacidades, sin socket de Docker. No muestra líneas de comando de procesos (solo su nombre) y solo acepta GET.
- `MONITOR_DEMO=1` simula datos para ver el diseño en una PC sin sensores. El historial y los récords se guardan en el volumen `monitor-data`.

## Citas en línea (landing → app)

El taller comparte por WhatsApp el enlace **`https://vc.motopartes.cloud/cita`** (redirige al formulario `#citas` de la landing, con vista previa Open Graph). El cliente captura nombre, WhatsApp, moto (marca/modelo/año), servicio, fecha, hora y notas.

- **API pública** (`apps/api/src/routes/public.js`, sin login): `GET /api/public/appointments/availability?fecha=YYYY-MM-DD` (horas libres) y `POST /api/public/appointments`. Valida horario (lun–sáb, 9:00–17:00, zona UTC-6, mínimo 1 h de anticipación, máximo 120 días), evita sobrecupo (`APPT_SLOT_CAPACITY`, por defecto 2 citas por hora) y limita por teléfono (`APPT_PHONE_DAILY_LIMIT`, por defecto 6/24 h). La cita queda `pending_external` en el workspace de `LANDING_VC_WORKSPACE_ID` y se avisa al cliente por WhatsApp.
- **App** (`/mechanic/appointments`): las citas web aparecen como "Pendiente web" con moto y notas, globo naranja en el menú, y Confirmar/Rechazar (avisa al cliente). La misma pantalla trae la tarjeta "Enlace para citas en línea" (copiar / enviar por WhatsApp). El mapa workspace → enlace está en `BOOKING_LINKS` de `AppointmentCalendar.jsx`.
- Los scripts de la landing aíslan cada inicializador (`app.js`): un error en uno ya no deja el formulario muerto.

### Flujo de la cita (solicitud → revisión → confirmación)

1. **Solicitud:** el cliente llena el formulario; la cita queda `pending_external` ("Por revisar") con un enlace único `/cita/<código>` (24 caracteres aleatorios) y recibe el mensaje 1 por WhatsApp.
2. **Revisión (panel de MotoPartes → Citas):** *Aceptar* (confirma y avisa), *Proponer otra fecha* (estado `proposal_sent`; el horario propuesto queda apartado `APPT_PROPOSAL_TTL_HOURS` = 24 h) o *No disponible* (el cliente puede elegir otra fecha desde su enlace).
3. **El cliente** entra a su enlace y acepta, elige otro día, rechaza o cancela; cada respuesta actualiza la cita, deja un aviso en el panel (globo + sonido en el menú) y manda el mensaje correspondiente.
4. **Tareas automáticas** (`startAppointmentJobs`, cada 5 min): recordatorio de propuesta a mitad de la vigencia, vencimiento (si era el cambio de una cita confirmada, vuelve a confirmada) y recordatorios 24 h / 2 h antes de la cita (se omiten si el taller tiene su propia automatización `appointment.upcoming_*`).
5. **Días sin servicio** (`blocked_days`): no se ofrecen en el formulario ni en el enlace; el panel avisa qué citas ya había ese día.
6. Cambiar la fecha de una cita **confirmada** siempre pasa por una propuesta que el cliente debe aceptar. Si WhatsApp no está conectado, el panel muestra el mensaje y el enlace para enviarlos a mano.

Código: `apps/api/src/lib/appointment-flow.js` (textos, envío, horarios, tareas), `routes/public.js` (cliente), `routes/appointments.js` (taller), `apps/landing-vc/cita.html` y `cita.js` (página del enlace). Variables: `PUBLIC_APPT_BASE`, `APPT_SLOT_CAPACITY`, `APPT_PROPOSAL_TTL_HOURS`, `SHOP_MAPS_URL`.

## Licencia

Privado. Todos los derechos reservados © 2026 MotoPartes.
