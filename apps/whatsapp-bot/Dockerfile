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

COPY package*.json ./
COPY prisma ./prisma/ 

RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
RUN npx prisma generate

COPY src ./src/

# Create auth dir for session persistence (mounted as volume)
RUN mkdir -p .wwebjs_auth

EXPOSE 3001

CMD ["node", "src/index.js"]
