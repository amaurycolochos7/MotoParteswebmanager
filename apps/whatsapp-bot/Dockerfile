FROM node:20-bookworm

# Install system dependencies needed by Chrome (but NOT chromium itself)
# Puppeteer v24 will download its own compatible Chrome for Testing
RUN apt-get update && apt-get install -y \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libdbus-1-3 \
    libx11-xcb1 \
    wget \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Do NOT skip Chromium download — Puppeteer v24 needs Chrome 130+
# which is newer than what Debian repos provide
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Session data persists in this volume across deploys
ENV WWEBJS_DATA_PATH=/app/data/.wwebjs_auth

WORKDIR /app

# Copy from repo root context (dockerContextPath: .)
COPY apps/whatsapp-bot/package*.json ./
COPY apps/whatsapp-bot/prisma ./prisma/

RUN npm install --omit=dev
RUN npx prisma generate

COPY apps/whatsapp-bot/src ./src/

# Create data directory for session persistence (mounted as volume)
RUN mkdir -p /app/data/.wwebjs_auth

EXPOSE 3002

CMD ["node", "src/index.js"]
