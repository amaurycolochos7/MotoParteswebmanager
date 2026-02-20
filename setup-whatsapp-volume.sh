#!/bin/bash
# Setup script for WhatsApp session persistence
# Run this ONCE on the server before deploying
#
# This creates an external Docker volume that survives `docker compose down -v`
# so WhatsApp sessions persist across deploys (no more QR re-scanning)

set -e

echo "🔧 Setting up WhatsApp session persistence..."

# Create the external volume if it doesn't exist
if docker volume inspect whatsapp_sessions >/dev/null 2>&1; then
    echo "✅ Volume 'whatsapp_sessions' already exists"
else
    docker volume create whatsapp_sessions
    echo "✅ Created volume 'whatsapp_sessions'"
fi

# Try to migrate data from old volume names (if they exist)
OLD_VOLUMES=(
    "whatsapp_data"
    "whatsapp-data"
    "motopartes-manager_whatsapp_data"
    "motopartes-manager_whatsapp-data"
)

for OLD_VOL in "${OLD_VOLUMES[@]}"; do
    if docker volume inspect "$OLD_VOL" >/dev/null 2>&1; then
        echo "📦 Found old volume '$OLD_VOL', migrating data..."
        # Use a temporary container to copy data between volumes
        docker run --rm \
            -v "$OLD_VOL":/source:ro \
            -v whatsapp_sessions:/dest \
            alpine sh -c "cp -a /source/. /dest/ 2>/dev/null || true"
        echo "✅ Migrated data from '$OLD_VOL'"
    fi
done

echo ""
echo "✅ Setup complete! WhatsApp sessions will now persist across deploys."
echo ""
echo "Volume info:"
docker volume inspect whatsapp_sessions --format '  Name: {{.Name}}'
docker volume inspect whatsapp_sessions --format '  Mountpoint: {{.Mountpoint}}'
docker volume inspect whatsapp_sessions --format '  Created: {{.CreatedAt}}'
