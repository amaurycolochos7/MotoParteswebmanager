# Build stage
FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL=/api
ARG VITE_WHATSAPP_BOT_URL=/api/whatsapp-bot

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WHATSAPP_BOT_URL=$VITE_WHATSAPP_BOT_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
