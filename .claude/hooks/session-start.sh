#!/bin/bash
# ============================================================
# session-start.sh — install ui/ dependencies for Claude sessions
# ============================================================
# Pinned to Node 20 (matches scripts/deploy.sh and ui/Dockerfile).
# Runs only in Claude Code on the web (CLAUDE_CODE_REMOTE=true) so
# local dev shells aren't slowed down.
#
# Never fails the session — any error inside is logged and ignored.
# The previous workflow (shell-only checks, no node_modules) still
# works as a fallback if this hook can't install for any reason.
# ============================================================

set -uo pipefail

# Only run in the remote (web) sandbox.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
UI_DIR="$REPO_DIR/ui"
LOG_PREFIX="[mmc-session-start]"

# Tolerate any failure — log + exit 0. The user-asked-for promise:
# "should not fail the session if npm install fails."
fail_soft() {
    echo "$LOG_PREFIX warn: $*" >&2
    exit 0
}

if [ ! -d "$UI_DIR" ]; then
    fail_soft "ui/ directory not found at $UI_DIR — skipping"
fi

# --- Pin Node 20 ----------------------------------------------------------
# Same major as ui/Dockerfile (node:20-alpine) and what deploy.sh installs
# via NodeSource setup_20.x. Prefer the sandbox's pre-baked /opt/node20
# (universal across web sessions); fall back to nvm / system node.
NODE20_BIN=""
if [ -x /opt/node20/bin/node ]; then
    NODE20_BIN="/opt/node20/bin"
elif command -v nvm >/dev/null 2>&1; then
    # shellcheck disable=SC1090
    . "$(command -v nvm | xargs dirname)/nvm.sh" 2>/dev/null || true
    nvm install 20 >/dev/null 2>&1 || true
    nvm use 20 >/dev/null 2>&1 || true
    NODE20_BIN="$(dirname "$(command -v node)")"
elif command -v node >/dev/null 2>&1; then
    _v="$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    if [ "$_v" = "20" ]; then
        NODE20_BIN="$(dirname "$(command -v node)")"
    fi
fi

if [ -z "$NODE20_BIN" ]; then
    fail_soft "Node 20 not available on PATH or at /opt/node20 — install it for type-checks to work"
fi

export PATH="$NODE20_BIN:$PATH"
# Persist for the rest of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$NODE20_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

NODE_VER="$(node --version 2>/dev/null || echo unknown)"
echo "$LOG_PREFIX using Node $NODE_VER from $NODE20_BIN"

# --- Install ui/ deps -----------------------------------------------------
# Skip if package-lock.json hash hasn't changed and node_modules exists.
# Container state caches across sessions per the skill guidance, so this
# turns subsequent session starts into a no-op.
cd "$UI_DIR" || fail_soft "could not cd to $UI_DIR"

LOCK_FILE="package-lock.json"
HASH_FILE="node_modules/.mmc-session-lock-hash"

if [ -f "$LOCK_FILE" ]; then
    CURRENT_HASH="$(sha256sum "$LOCK_FILE" 2>/dev/null | awk '{print $1}')"
else
    CURRENT_HASH=""
fi
STORED_HASH="$(cat "$HASH_FILE" 2>/dev/null || true)"

if [ -d node_modules ] \
   && [ -n "$CURRENT_HASH" ] \
   && [ "$CURRENT_HASH" = "$STORED_HASH" ]; then
    echo "$LOG_PREFIX node_modules cached — skipping install"
    exit 0
fi

echo "$LOG_PREFIX running npm install in ui/ (lock changed or first run)..."
# `npm install` rather than `npm ci` per skill guidance — incremental updates
# play nicer with cached container state. Still installs from the lockfile.
if npm install --no-audit --no-fund --loglevel=error; then
    [ -n "$CURRENT_HASH" ] && echo "$CURRENT_HASH" > "$HASH_FILE"
    echo "$LOG_PREFIX npm install complete"
else
    fail_soft "npm install failed — TypeScript checks will be unavailable this session"
fi

exit 0
