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

## Licencia

Privado. Todos los derechos reservados © 2026 MotoPartes.
