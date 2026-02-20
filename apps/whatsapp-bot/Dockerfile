FROM node:20-bookworm

# Install Chromium and ALL system dependencies for Puppeteer/Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libnspr4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    libxshmfence1 \
    libgl1 \
    libglib2.0-0 \
    libdbus-1-3 \
    ca-certificates \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium (don't download its own)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Session data persists in this volume across deploys
# This path MUST match the volume mount in docker-compose
ENV WWEBJS_DATA_PATH=/app/data/wwebjs_auth

WORKDIR /app

# Copy package files and prisma schema
COPY apps/whatsapp-bot/package*.json ./
COPY apps/whatsapp-bot/prisma ./prisma/

RUN npm install --omit=dev

# Copy and run the patch script to fix whatsapp-web.js
COPY apps/whatsapp-bot/patch-wwebjs.cjs ./patch-wwebjs.cjs
# CRITICAL PATCH: Disable the Error constructor override in whatsapp-web.js
# The ocVersion patch (evaluateOnNewDocument that replaces global Error) was designed
# for older WhatsApp Web versions. On modern WA Web, it prevents window.Debug.VERSION
# from ever being set, causing the entire library to hang with an "auth timeout".
# AB test confirmed: WITHOUT this patch, Debug.VERSION appears in 2s; WITH it, NEVER.
RUN node patch-wwebjs.cjs

RUN npx prisma generate

# Copy source code
COPY apps/whatsapp-bot/src ./src/

# Create persistent data directory (mounted as volume)
RUN mkdir -p /app/data/wwebjs_auth

EXPOSE 3002

CMD ["node", "src/index.js"]
