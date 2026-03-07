#!/bin/sh
# ============================================================
# backup.sh — Back up all service config directories
# ============================================================
# Usage: ./scripts/backup.sh
# Reads CONFIG_ROOT, BACKUP_DIR from .env
# Keeps last 7 backups, deletes older ones.
# Suitable for cron (no interactive prompts).
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env
ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

set -a
. "$ENV_FILE"
set +a

CONFIG_ROOT="${CONFIG_ROOT:-$HOME/.mmc/config}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.mmc/backups}"

# Resolve relative paths
case "$CONFIG_ROOT" in
    /*) ;;
    *)  CONFIG_ROOT="$PROJECT_DIR/$CONFIG_ROOT" ;;
esac
case "$BACKUP_DIR" in
    /*) ;;
    *)  BACKUP_DIR="$PROJECT_DIR/$BACKUP_DIR" ;;
esac

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Create timestamped backup
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_FILE="$BACKUP_DIR/mars-media-centre-backup-$TIMESTAMP.tar.gz"

echo "=== Mars Media Centre — Backup ==="
echo "Source:  $CONFIG_ROOT"
echo "Target:  $BACKUP_FILE"
echo ""

tar -czf "$BACKUP_FILE" -C "$(dirname "$CONFIG_ROOT")" "$(basename "$CONFIG_ROOT")"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✓ Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"

# Rotate: keep last 7 backups
echo ""
echo "Rotating backups (keeping last 7)..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/mars-media-centre-backup-*.tar.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt 7 ]; then
    ls -1t "$BACKUP_DIR"/mars-media-centre-backup-*.tar.gz | tail -n +"8" | while read -r old_backup; do
        echo "  Removing: $(basename "$old_backup")"
        rm -f "$old_backup"
    done
fi

REMAINING=$(ls -1 "$BACKUP_DIR"/mars-media-centre-backup-*.tar.gz 2>/dev/null | wc -l)
echo "✓ $REMAINING backup(s) retained"
