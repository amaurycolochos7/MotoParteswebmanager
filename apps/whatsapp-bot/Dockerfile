FROM node:20-slim

# Install Chromium for whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy from repo root context (dockerContextPath: .)
COPY apps/whatsapp-bot/package*.json ./
COPY apps/whatsapp-bot/prisma ./prisma/

RUN npm install --omit=dev
RUN npx prisma generate

COPY apps/whatsapp-bot/src ./src/

EXPOSE 3001 3002

CMD ["node", "src/index.js"]

