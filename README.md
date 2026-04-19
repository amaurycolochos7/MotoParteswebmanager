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

Producción corre en Dokploy como tres apps separadas, servidas en `motopartes.cloud`, `motopartes.cloud/api`, y `motopartes.cloud/api/whatsapp-bot`.

## Desarrollo local

### Prerrequisitos
- Docker + Docker Compose
- Node.js 20+ (solo si quieres correr tests o la UI fuera de Docker)

### Arranque en 4 comandos

```
cp apps/api/.env.example          apps/api/.env
cp apps/whatsapp-bot/.env.example apps/whatsapp-bot/.env
cp apps/frontend/.env.example     apps/frontend/.env
docker compose up --build
```

Listo:
- Frontend: http://localhost:5173
- API: http://localhost:3000/api/health
- Bot: http://localhost:3002/health

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

Push a `main` → Dokploy sincroniza los tres apps desde git. Las imágenes se construyen en el VPS y se actualizan vía `docker service update`. El mapa de servicios Dokploy → contenedor real vive en la nota de memoria "Deployment map" del equipo.

**Rotación de secretos**: `JWT_SECRET` y `WHATSAPP_API_KEY` se configuran en Dokploy → app → Environment. Sin ellos los servicios arrancan con un fallback legacy y registran un warning ruidoso — es por diseño para no tumbar producción en un push. Rotar invalida todas las sesiones vigentes.

## Licencia

Privado. Todos los derechos reservados © 2026 MotoPartes.
