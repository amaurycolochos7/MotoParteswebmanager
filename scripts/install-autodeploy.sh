#!/usr/bin/env bash
# Instala (idempotente) la tarea cron del usuario que ejecuta scripts/deploy.sh
# cada minuto. No requiere sudo. Ejecutar una sola vez en el servidor.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chmod +x "$REPO_DIR/scripts/deploy.sh"
LINE="* * * * * $REPO_DIR/scripts/deploy.sh >/dev/null 2>&1  # motopartes-autodeploy"
( crontab -l 2>/dev/null | grep -v 'motopartes-autodeploy' ; echo "$LINE" ) | crontab -
echo "Auto-deploy instalado:"; crontab -l | grep motopartes-autodeploy
