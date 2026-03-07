#!/bin/sh
# ============================================================
# restore.sh — Restore config directories from a backup archive
# ============================================================
# Usage: ./scripts/restore.sh <backup-file.tar.gz>
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check argument
if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file.tar.gz>"
    echo ""
    echo "Available backups:"
    ls -1t "$PROJECT_DIR"/backups/mars-media-centre-backup-*.tar.gz 2>/dev/null || echo "  (none found)"
    exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Load .env
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

set -a
. "$ENV_FILE"
set +a

CONFIG_ROOT="${CONFIG_ROOT:-./config}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Resolve relative path
case "$CONFIG_ROOT" in
    /*) ;;
    *)  CONFIG_ROOT="$PROJECT_DIR/$CONFIG_ROOT" ;;
esac

echo "=== Mars Media Centre — Restore ==="
echo "Backup:  $BACKUP_FILE"
echo "Target:  $CONFIG_ROOT"
echo ""
echo "WARNING: This will overwrite existing configs in $CONFIG_ROOT"
echo ""

# Prompt for confirmation
printf "Continue? [y/N] "
read -r CONFIRM
case "$CONFIRM" in
    [yY]|[yY][eE][sS]) ;;
    *)
        echo "Aborted."
        exit 0
        ;;
esac

# Stop containers
echo ""
echo "Stopping containers..."
cd "$PROJECT_DIR"
docker compose down 2>/dev/null || echo "  ⚠ docker compose down failed (containers may not be running)"

# Extract backup
echo ""
echo "Restoring configs..."
tar -xzf "$BACKUP_FILE" -C "$(dirname "$CONFIG_ROOT")"

# Set ownership
echo "Setting ownership ($PUID:$PGID)..."
chown -R "$PUID:$PGID" "$CONFIG_ROOT" 2>/dev/null || echo "  ⚠ Could not chown (run with sudo if needed)"

echo ""
echo "✓ Restore complete!"
echo ""
echo "Next steps:"
echo "  docker compose up -d"
