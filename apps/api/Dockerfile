FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

COPY src ./src/

EXPOSE 3000

# Run migrations and start
CMD npx prisma migrate deploy && node src/index.js
