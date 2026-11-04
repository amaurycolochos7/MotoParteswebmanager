# Build stage
FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL=/api
ARG VITE_WHATSAPP_BOT_URL=/api/whatsapp-bot

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WHATSAPP_BOT_URL=$VITE_WHATSAPP_BOT_URL

# Copy from apps/frontend/ (context is repo root)
COPY apps/frontend/package*.json ./
RUN npm ci

COPY apps/frontend/ .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# nginx config as template: the official nginx image runs envsubst on
# /etc/nginx/templates/*.template at startup (only on variables that are defined).
COPY apps/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=api API_PORT=3000

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
