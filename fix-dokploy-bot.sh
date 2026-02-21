#!/bin/bash
# Fix the Dokploy-managed whatsapp-bot container
# This container lacks the Error constructor override patch

DOKPLOY_BOT=$(docker ps -q --filter name=app-calculate-cross-platform-monitor)
echo "BOT_ID=$DOKPLOY_BOT"

if [ -z "$DOKPLOY_BOT" ]; then
    echo "ERROR: Dokploy bot container not found!"
    exit 1
fi

# Copy the patch script
docker cp /root/motopartes-manager/apps/whatsapp-bot/patch-wwebjs.cjs "$DOKPLOY_BOT:/app/patch-wwebjs.cjs"
echo "COPY_DONE"

# Run the patch
docker exec "$DOKPLOY_BOT" node /app/patch-wwebjs.cjs
echo "PATCH_DONE"

# Also copy the updated WhatsAppSession.js with modern Chrome UA and longer timeout
docker cp /root/motopartes-manager/apps/whatsapp-bot/src/WhatsAppSession.js "$DOKPLOY_BOT:/app/src/WhatsAppSession.js"
echo "SESSION_JS_COPIED"

# Restart the Dokploy bot container to pick up changes
docker restart "$DOKPLOY_BOT"
echo "RESTARTED"

# Wait for it to come up
sleep 20

# Test QR
curl -s "http://localhost:3002/sessions/0dc9ae6e-9d14-4d28-8651-1baf72ea2558/status" -H 'x-api-key: motopartes-whatsapp-key' 2>/dev/null
echo ""
echo "=== QR ==="
curl -s "http://localhost:3002/sessions/0dc9ae6e-9d14-4d28-8651-1baf72ea2558/qr" -H 'x-api-key: motopartes-whatsapp-key' 2>/dev/null | head -c 200
echo ""
echo "ALL_DONE"
