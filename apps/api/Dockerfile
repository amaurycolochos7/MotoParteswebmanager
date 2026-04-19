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

# Run migrations, seed super-admin, then start. `&&` hace fail-fast si db push
# falla — evitamos arrancar con Prisma Client nuevo contra schema viejo (bug
# histórico 2026-04-19). El seed es idempotente y no bloqueante.
CMD npx prisma db push --accept-data-loss && node prisma/seed-super-admin.js; node src/index.js
