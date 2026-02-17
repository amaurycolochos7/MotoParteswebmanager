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

# Copy from apps/whatsapp-bot/ (context is repo root)
COPY apps/whatsapp-bot/package*.json ./
COPY apps/whatsapp-bot/prisma ./prisma/

RUN npm ci --omit=dev
RUN npx prisma generate

COPY apps/whatsapp-bot/src ./src/

EXPOSE 3001

CMD ["node", "src/index.js"]
