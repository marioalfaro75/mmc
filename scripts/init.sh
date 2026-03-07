#!/bin/sh
# ============================================================
# init.sh — Create data and config directory trees
# ============================================================
# Usage: ./scripts/init.sh
# Reads DATA_ROOT, CONFIG_ROOT, PUID, PGID from .env
# Safe to run multiple times (idempotent).
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    echo "Copy .env.example to .env and fill in your values first:"
    echo "  cp .env.example .env"
    exit 1
fi

# Source .env (skip comments and empty lines)
set -a
. "$ENV_FILE"
set +a

# Defaults
DATA_ROOT="${DATA_ROOT:-$HOME/.mmc/data}"
CONFIG_ROOT="${CONFIG_ROOT:-$HOME/.mmc/config}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Resolve relative CONFIG_ROOT
case "$CONFIG_ROOT" in
    /*) ;; # absolute path, keep as-is
    *)  CONFIG_ROOT="$PROJECT_DIR/$CONFIG_ROOT" ;;
esac

echo "=== Mars Media Centre — Directory Initialisation ==="
echo ""
echo "DATA_ROOT:   $DATA_ROOT"
echo "CONFIG_ROOT: $CONFIG_ROOT"
echo "PUID:PGID:   $PUID:$PGID"
echo ""

# --- Data directories ---
echo "Creating data directories..."
DATA_DIRS="
$DATA_ROOT/torrents/movies
$DATA_ROOT/torrents/tv
$DATA_ROOT/usenet/movies
$DATA_ROOT/usenet/tv
$DATA_ROOT/usenet/incomplete
$DATA_ROOT/media/movies
$DATA_ROOT/media/tv
$DATA_ROOT/watch
"

for dir in $DATA_DIRS; do
    mkdir -p "$dir"
    echo "  ✓ $dir"
done

# --- Config directories ---
echo ""
echo "Creating config directories..."
CONFIG_SERVICES="gluetun qbittorrent sabnzbd sonarr radarr prowlarr plex seerr bazarr tautulli recyclarr"

for svc in $CONFIG_SERVICES; do
    mkdir -p "$CONFIG_ROOT/$svc"
    echo "  ✓ $CONFIG_ROOT/$svc"
done

# --- Set ownership and permissions ---
echo ""
echo "Setting ownership ($PUID:$PGID) and permissions (775)..."
chown -R "$PUID:$PGID" "$DATA_ROOT" 2>/dev/null || echo "  ⚠ Could not chown $DATA_ROOT (run with sudo if needed)"
chmod -R 775 "$DATA_ROOT" 2>/dev/null || echo "  ⚠ Could not chmod $DATA_ROOT"

chown -R "$PUID:$PGID" "$CONFIG_ROOT" 2>/dev/null || echo "  ⚠ Could not chown $CONFIG_ROOT (run with sudo if needed)"
chmod -R 775 "$CONFIG_ROOT" 2>/dev/null || echo "  ⚠ Could not chmod $CONFIG_ROOT"

echo ""
echo "=== Done! ==="
echo "Next steps:"
echo "  1. Edit .env with your VPN credentials and preferences"
echo "  2. Run: docker compose up -d"
