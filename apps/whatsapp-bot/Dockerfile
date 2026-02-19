FROM node:20-bookworm

# Install Chromium and all required dependencies for Puppeteer/whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Verify chromium installed
RUN which chromium && chromium --version || (which chromium-browser && chromium-browser --version) || echo "WARNING: chromium not found"

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Debian bookworm may install as 'chromium' or 'chromium-browser'
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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
