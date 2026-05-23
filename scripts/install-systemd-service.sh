#!/bin/bash
# ============================================================
# install-systemd-service.sh
# Installs mmc.service so the Docker Compose stack starts at
# boot on a dedicated Ubuntu host. Idempotent — safe to re-run
# after moving the repo or changing the user.
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE="$SCRIPT_DIR/mmc.service"
UNIT_PATH="/etc/systemd/system/mmc.service"
TARGET_USER="${SUDO_USER:-$USER}"

if [ "$(id -u)" -ne 0 ]; then
    echo "Re-running with sudo..."
    exec sudo -E "$0" "$@"
fi

if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: template not found at $TEMPLATE" >&2
    exit 1
fi

if grep -qi microsoft /proc/version 2>/dev/null; then
    echo "WSL detected — systemd is not the right boot mechanism here."
    echo "Use the [boot] section of /etc/wsl.conf instead. Aborting."
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "ERROR: systemctl not found — this host doesn't use systemd." >&2
    exit 1
fi

echo "Installing $UNIT_PATH for user '$TARGET_USER' in $PROJECT_DIR"
sed \
    -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__USER__|$TARGET_USER|g" \
    "$TEMPLATE" > "$UNIT_PATH"
chmod 644 "$UNIT_PATH"

systemctl daemon-reload
systemctl enable mmc.service

echo ""
echo "Done. The stack will start on boot."
echo "  Start now:  sudo systemctl start mmc"
echo "  Status:     sudo systemctl status mmc"
echo "  Disable:    sudo systemctl disable mmc"
