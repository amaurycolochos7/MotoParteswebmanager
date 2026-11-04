# Panel de salud del servidor (solo lectura). Sin dependencias npm.
FROM node:20-alpine

WORKDIR /app
COPY server.mjs index.html ./

# Volumen para el historial/récords (sobrevive a los deploys). Usuario sin privilegios.
RUN mkdir -p /data && chown node:node /data
USER node

ENV NODE_ENV=production PORT=8088 DATA_DIR=/data
EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=4s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8088/healthz >/dev/null || exit 1

CMD ["node", "server.mjs"]
