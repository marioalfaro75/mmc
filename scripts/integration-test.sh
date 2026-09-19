#!/usr/bin/env bash
# ============================================================
# integration-test.sh — boot a real stack and assert against it
#
# Brings up the services the dashboard talks to over HTTP (see
# docker-compose.ci.yml for what is deliberately left out and why), seeds
# the *arr API keys the way deploy.sh does, then runs
# scripts/integration-assert.mjs against the running containers.
#
#   ./scripts/integration-test.sh            # up, assert, tear down
#   ./scripts/integration-test.sh --keep     # leave it running to poke at
#
# Safe to run locally: an existing .env is moved aside and restored on exit.
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

CI_ROOT="$PROJECT_DIR/.ci"
CONFIG_ROOT="$CI_ROOT/config"
DATA_ROOT="$CI_ROOT/data"
BACKUP_DIR="$CI_ROOT/backups"
ENV_FILE="$PROJECT_DIR/.env"
ENV_BACKUP="$PROJECT_DIR/.env.integration-backup"
PORT_UI=3000
UI="http://127.0.0.1:${PORT_UI}"

COMPOSE_ARGS=(compose
  -f "$PROJECT_DIR/docker-compose.yml"
  -f "$PROJECT_DIR/docker-compose.build.yml"
  -f "$PROJECT_DIR/docker-compose.ci.yml"
  --project-directory "$PROJECT_DIR")

# Started explicitly. compose pulls in media-ui's depends_on anyway, but
# naming them keeps the set obvious and stops a future depends_on edit from
# silently widening what the test boots.
SERVICES=(prowlarr sonarr radarr bazarr seerr media-ui)

# Set once this script has written its own .env — see cleanup().
WROTE_ENV=0

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    say "FAILED (exit $rc) — container logs"
    for svc in "${SERVICES[@]}"; do
      printf '\n--- %s ---\n' "$svc"
      docker "${COMPOSE_ARGS[@]}" logs --tail 40 "$svc" 2>&1 || true
    done
    docker "${COMPOSE_ARGS[@]}" ps -a 2>&1 || true
  fi

  if [ "$KEEP" = "1" ]; then
    say "Left running (--keep). Tear down with:"
    echo "  docker ${COMPOSE_ARGS[*]} down -v"
    echo "  rm -rf $CI_ROOT"
    return
  fi

  say "Tearing down"
  docker "${COMPOSE_ARGS[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  # Container-created files are owned by PUID; on a runner that is the
  # current user, but be tolerant either way.
  rm -rf "$CI_ROOT" 2>/dev/null || sudo rm -rf "$CI_ROOT" 2>/dev/null || true
  # Restore whatever was here, and only delete a .env this script wrote
  # itself. Without the WROTE_ENV guard, failing anywhere between the trap
  # being set and the file being written would remove a developer's real
  # .env with no backup to put back.
  if [ -f "$ENV_BACKUP" ]; then
    mv -f "$ENV_BACKUP" "$ENV_FILE"
  elif [ "$WROTE_ENV" = "1" ]; then
    rm -f "$ENV_FILE"
  fi
  exit $rc
}
trap cleanup EXIT

# ------------------------------------------------------------------
say "Preparing workspace"

[ -f "$ENV_FILE" ] && mv -f "$ENV_FILE" "$ENV_BACKUP"
mkdir -p "$CONFIG_ROOT" "$DATA_ROOT" "$BACKUP_DIR" "$HOME/.mmc/logs" "$HOME/.mmc/scripts"

# A synthetic .env. VPN credentials are deliberately blank — nothing that
# needs them is started. Written rather than derived from .env.example so
# the test is not silently reconfigured by an edit to the example.
cat > "$ENV_FILE" <<EOF
TZ=UTC
PUID=$(id -u)
PGID=$(id -g)
UMASK=002
DATA_ROOT=$DATA_ROOT
CONFIG_ROOT=$CONFIG_ROOT
BACKUP_DIR=$BACKUP_DIR
HOST_PROJECT_DIR=$PROJECT_DIR
LOG_LEVEL=info
MMC_API_KEY=
HTTPS_ONLY=0
GLUETUN_CONTROL_PASSWORD=integration
VPN_SERVICE_PROVIDER=protonvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=
WIREGUARD_ADDRESSES=
WIREGUARD_PRESHARED_KEY=
WIREGUARD_MTU=1420
SERVER_COUNTRIES=
SECURE_CORE_ONLY=off
SERVER_HOSTNAMES=
VPN_PORT_FORWARDING=off
FIREWALL_VPN_INPUT_PORTS=
DOCKER_SUBNET=172.29.0.0/24
LOCAL_SUBNET=192.168.1.0/24
HOST_BIND=127.0.0.1
PORT_SONARR=8989
PORT_RADARR=7878
PORT_PROWLARR=9696
PORT_BAZARR=6767
PORT_SEERR=5055
PORT_QBITTORRENT=8080
PORT_SABNZBD=8081
PORT_GLUETUN_CONTROL=8000
PORT_UI=$PORT_UI
USE_QBITTORRENT=off
USE_SABNZBD=off
QBITTORRENT_PASSWORD=
SABNZBD_API_KEY=
SONARR_API_KEY=
RADARR_API_KEY=
PROWLARR_API_KEY=
BAZARR_API_KEY=
SEERR_API_KEY=
TMDB_API_KEY=
PLEX_URL=
FLARESOLVERR_LOG_LEVEL=info
WATCHTOWER_SCHEDULE=
WATCHTOWER_NOTIFICATIONS=
EOF

# Image pins come from the example so CI tests the versions we actually
# ship, and a refresh-image-pins PR is exercised at its new tags.
grep -E '^IMAGE_[A-Z_]+=' .env.example >> "$ENV_FILE"
WROTE_ENV=1

# ------------------------------------------------------------------
say "Creating the directory tree (scripts/init.sh)"
# The same script deploy.sh runs before it deploys. Not a hand-rolled
# mkdir: the per-service config directories have to exist AND be owned by
# PUID before the containers start.
#
# The LSIO images paper over a missing directory — their /init runs as
# root and chowns /config — but Seerr's does not. Left to Docker,
# $CONFIG_ROOT/seerr gets auto-created root-owned on the bind mount and
# Seerr dies at startup with
#   EACCES: permission denied, mkdir '/app/config/logs/'
# Calling init.sh here also means this path is exercised by CI rather
# than only ever running on a user's VM.
"$PROJECT_DIR/scripts/init.sh"

# ------------------------------------------------------------------
say "Building media-ui and starting the stack"
# Built from this commit, not pulled — otherwise the run tests whatever was
# published last rather than the change under review.
docker "${COMPOSE_ARGS[@]}" build media-ui
docker "${COMPOSE_ARGS[@]}" up -d --no-build "${SERVICES[@]}"

# ------------------------------------------------------------------
say "Waiting for the *arr apps to write their config"
# Same contract deploy.sh's _wait_for_file + _xml_api_key rely on.
for svc in sonarr radarr prowlarr; do
  file="$CONFIG_ROOT/$svc/config.xml"
  waited=0
  until [ -f "$file" ] && grep -q '<ApiKey>' "$file" 2>/dev/null; do
    if [ "$waited" -ge 180 ]; then
      echo "timed out after ${waited}s waiting for $file" >&2
      exit 1
    fi
    sleep 3; waited=$((waited + 3))
  done
  echo "  $svc wrote config.xml after ${waited}s"
done

# ------------------------------------------------------------------
say "Seeding API keys"
# Deliberately the same extraction deploy.sh uses, so a change in upstream's
# config format fails here the way it would fail a real install.
for svc in sonarr radarr prowlarr; do
  key=$(grep -oE '<ApiKey>[^<]+</ApiKey>' "$CONFIG_ROOT/$svc/config.xml" \
        | head -1 | sed -e 's|<ApiKey>||' -e 's|</ApiKey>||')
  [ -n "$key" ] || { echo "could not extract $svc API key" >&2; exit 1; }
  envkey=$(echo "$svc" | tr '[:lower:]' '[:upper:]')_API_KEY
  sed -i "s|^${envkey}=.*|${envkey}=${key}|" "$ENV_FILE"
  echo "  seeded $envkey"
done

# media-ui captured the blank keys at start; Docker fixes env at container
# creation, so .env changes need a recreate to take effect. This is the same
# gotcha seed_qbittorrent_password documents in deploy.sh.
say "Recreating media-ui with the seeded keys"
docker "${COMPOSE_ARGS[@]}" up -d --no-build --force-recreate media-ui

waited=0
until curl -fsS "${UI}/api/health/live" >/dev/null 2>&1; do
  if [ "$waited" -ge 120 ]; then
    echo "media-ui did not answer on ${UI} after ${waited}s" >&2
    exit 1
  fi
  sleep 3; waited=$((waited + 3))
done
echo "  media-ui answering after ${waited}s"

# ------------------------------------------------------------------
say "Running assertions"
node "$PROJECT_DIR/scripts/integration-assert.mjs" \
  --config-root "$CONFIG_ROOT" \
  --ui "$UI" \
  --project-dir "$PROJECT_DIR"
