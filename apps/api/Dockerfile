FROM node:20-alpine

WORKDIR /app

# Copy from apps/api/ (context is repo root)
COPY apps/api/package*.json ./
COPY apps/api/prisma ./prisma/
COPY migrations ./prisma/migrations/

RUN npm ci --omit=dev
RUN npx prisma generate

COPY apps/api/src ./src/

EXPOSE 3000

# Sincroniza el schema al arrancar SIN `--accept-data-loss` (seguridad de datos).
# Sin ese flag, `prisma db push` aplica cambios ADITIVOS automáticamente, pero
# ABORTA (exit != 0) si detectara un cambio destructivo (drop de columna/tabla,
# recreate con pérdida), en vez de borrar datos reales. El `&&` mantiene el
# fail-fast: si el push aborta, no seguimos al seed. Las migraciones DESTRUCTIVAS
# deben aplicarse MANUALMENTE antes del deploy (ver migrations/ y docs).
# El seed es idempotente; con `;` la API arranca aunque el seed falle.
CMD npx prisma db push && node prisma/seed-super-admin.js; node src/index.js
