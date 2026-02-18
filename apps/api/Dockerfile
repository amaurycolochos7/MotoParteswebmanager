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

# Run migrations and start
CMD npx prisma db push; node src/index.js
