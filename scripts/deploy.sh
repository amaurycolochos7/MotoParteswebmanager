#!/usr/bin/env bash
# Auto-deploy de MotoPartes en el servidor casero (servermacs).
#
# Lo ejecuta cron cada minuto (ver scripts/install-autodeploy.sh). Si origin/main
# trae commits nuevos: actualiza, reconstruye SOLO lo que cambio, espera a que
# los servicios esten sanos y, si algo falla, vuelve al commit anterior.
#
# Uso manual:  scripts/deploy.sh           (solo si hay commits nuevos)
#              scripts/deploy.sh --force   (reconstruye aunque no haya cambios)
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_FILE="${DEPLOY_LOG:-$HOME/motopartes-deploy.log}"
COMPOSE=(docker compose --profile tunnel)
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

# Un solo deploy a la vez (cron cada minuto + deploy manual)
exec 9>"/tmp/motopartes-deploy.lock"
flock -n 9 || { echo "Ya hay un deploy en curso"; exit 0; }

cd "$REPO_DIR" || exit 1

git fetch --quiet origin "$BRANCH" || { log "ERROR: git fetch fallo"; exit 1; }
CURRENT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse "origin/$BRANCH")"

if [ "$CURRENT" = "$TARGET" ] && [ "$FORCE" -eq 0 ]; then
  exit 0   # nada que desplegar (caso normal, no escribe log)
fi

# No reintentar en bucle un commit que ya fallo (se reintenta con --force o con un commit nuevo).
if [ "$FORCE" -eq 0 ] && [ -f "$REPO_DIR/.last-failed-deploy" ] \
   && [ "$(cat "$REPO_DIR/.last-failed-deploy")" = "$TARGET" ]; then
  exit 0
fi

log "Deploy: ${CURRENT:0:7} -> ${TARGET:0:7}"
git --no-pager log --oneline "$CURRENT..$TARGET" 2>/dev/null | sed 's/^/    /' | tee -a "$LOG_FILE"

# El servidor no debe tener ediciones locales: el origen de verdad es GitHub.
# (.env esta en .gitignore, no se toca.)
git reset --hard --quiet "$TARGET"

wait_healthy() {
  local tries=36   # 36 x 5s = 3 min (el bot tarda en arrancar Chrome)
  while [ $tries -gt 0 ]; do
    if curl -fsS -m 4 http://localhost:3000/api/health >/dev/null 2>&1 \
      && curl -fsS -m 4 http://localhost:3002/health >/dev/null 2>&1 \
      && curl -fsS -m 4 http://localhost:5173/api/health >/dev/null 2>&1; then
      return 0
    fi
    tries=$((tries - 1)); sleep 5
  done
  return 1
}

build_and_up() {
  "${COMPOSE[@]}" up -d --build --remove-orphans >>"$LOG_FILE" 2>&1
}

if build_and_up && wait_healthy; then
  log "OK: ${TARGET:0:7} desplegado y sano"
  rm -f "$REPO_DIR/.last-failed-deploy"
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

log "FALLO: ${TARGET:0:7} no quedo sano. Rollback a ${CURRENT:0:7}"
"${COMPOSE[@]}" logs --tail 40 api whatsapp-bot frontend >>"$LOG_FILE" 2>&1 || true
git reset --hard --quiet "$CURRENT"
if build_and_up && wait_healthy; then
  log "Rollback OK: ${CURRENT:0:7} restaurado"
else
  log "CRITICO: el rollback tampoco quedo sano, revisar manualmente"
fi
# Marca el commit fallido para no reintentarlo en bucle cada minuto.
echo "$TARGET" > "$REPO_DIR/.last-failed-deploy"
exit 1
