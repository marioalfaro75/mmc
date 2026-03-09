#!/bin/sh
# ============================================================
# deploy.sh — Bootstrap, install, and staged deployment
# ============================================================
# Usage: ./scripts/deploy.sh [--install] [--dry-run] [--skip-ui] [--ui-only] [--ui-docker] [--update] [--help]
#
# One-liner install (WSL/Linux):
#   curl -fsSL https://raw.githubusercontent.com/marioalfaro75/mmc/main/scripts/deploy.sh | bash -s -- --install
#
# Modes:
#   --install    Bootstrap from scratch: install prerequisites, clone repo,
#                then run full deploy. Designed for curl-pipe-bash usage.
#   --dry-run    Validate build, configs, and API routes
#                without starting Docker containers.
#   --update     Pull latest code, migrate .env, rebuild all containers.
#   --ui-only    Run the web UI locally via Next.js dev server (no Docker).
#   --ui-docker  Build and deploy only the web UI Docker container.
#   (default)    Full staged deploy with post-deploy checks.
#
# Options:
#   --skip-ui   Skip npm install / build (both modes)
#   --help      Print usage and exit
# ============================================================

set -e

# When piped via curl, $0 is "bash" and dirs won't resolve — handle gracefully
if [ -f "$0" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
else
    SCRIPT_DIR=""
    PROJECT_DIR=""
fi

# --- Defaults ---
DRY_RUN=0
SKIP_UI=0
UPDATE_MODE=0
UI_ONLY=0
UI_DOCKER=0
INSTALL_MODE=0
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
DEV_SERVER_PID=""
REPO_URL="https://github.com/marioalfaro75/mmc.git"
DEFAULT_INSTALL_DIR="$(pwd)/mmc"

# --- Logging ---
# On first invocation, re-exec ourselves through tee so all output
# (including child processes) is captured to a timestamped log file.
# Skip when piped (install mode) — logging starts after re-exec from cloned repo.
if [ -z "$_MMC_LOGGED" ] && [ -f "$0" ]; then
    _log_dir="${HOME}/.mmc/logs"
    mkdir -p "$_log_dir"
    LOG_FILE="$_log_dir/deploy-$(date +%Y%m%d-%H%M%S).log"
    _exit_file=$(mktemp)
    export _MMC_LOGGED="$LOG_FILE"
    # Re-run; capture exit code via temp file (POSIX-safe, no PIPESTATUS)
    { "$0" "$@" 2>&1; echo $? > "$_exit_file"; } | tee "$LOG_FILE"
    _rc=$(cat "$_exit_file")
    rm -f "$_exit_file"
    # Strip ANSI colour codes from the log file
    sed -i 's/\x1b\[[0-9;]*m//g' "$LOG_FILE" 2>/dev/null
    # Prune old logs — keep only the 10 most recent
    ls -1t "$_log_dir"/deploy-*.log 2>/dev/null | tail -n +11 | xargs -r rm -f
    exit "${_rc:-1}"
fi

# --- Colour output ---
setup_colors() {
    if [ -t 1 ]; then
        GREEN='\033[0;32m'
        YELLOW='\033[0;33m'
        RED='\033[0;31m'
        BOLD='\033[1m'
        RESET='\033[0m'
    else
        GREEN=''
        YELLOW=''
        RED=''
        BOLD=''
        RESET=''
    fi
}

# --- Logging helpers ---
pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    printf "  ${GREEN}✓${RESET} %s\n" "$1"
}

warn() {
    WARN_COUNT=$((WARN_COUNT + 1))
    printf "  ${YELLOW}⚠${RESET} %s\n" "$1"
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf "  ${RED}✗${RESET} %s\n" "$1"
}

section() {
    echo ""
    printf "${BOLD}=== %s ===${RESET}\n" "$1"
    echo ""
}

info() {
    printf "  %s\n" "$1"
}

# --- Interactive input (works when piped via curl | bash) ---
prompt_user() {
    _prompt="$1"
    _default="$2"
    if [ -n "$_default" ]; then
        printf "  %s [%s]: " "$_prompt" "$_default" >/dev/tty
    else
        printf "  %s: " "$_prompt" >/dev/tty
    fi
    read -r _answer </dev/tty
    echo "${_answer:-$_default}"
}

confirm_user() {
    _prompt="$1"
    _default="${2:-y}"
    if [ "$_default" = "y" ]; then
        printf "  %s [Y/n]: " "$_prompt" >/dev/tty
    else
        printf "  %s [y/N]: " "$_prompt" >/dev/tty
    fi
    read -r _answer </dev/tty
    _answer="${_answer:-$_default}"
    case "$_answer" in
        [Yy]*) return 0 ;;
        *) return 1 ;;
    esac
}

# --- JSON validation (cascade: python3 → node → heuristic) ---
is_json() {
    _input="$1"
    if command -v python3 >/dev/null 2>&1; then
        echo "$_input" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null
        return $?
    elif command -v node >/dev/null 2>&1; then
        echo "$_input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{JSON.parse(d)}catch(e){process.exit(1)}})" 2>/dev/null
        return $?
    else
        # Heuristic fallback: starts with { or [
        case "$_input" in
            "{"*|"["*) return 0 ;;
            *) return 1 ;;
        esac
    fi
}

# --- Help ---
show_help() {
    echo "Usage: $0 [--install] [--dry-run] [--skip-ui] [--ui-only] [--ui-docker] [--update] [--help]"
    echo ""
    echo "One-liner install:"
    echo "  curl -fsSL https://raw.githubusercontent.com/marioalfaro75/mmc/main/scripts/deploy.sh | bash -s -- --install"
    echo ""
    echo "Modes:"
    echo "  --install    Bootstrap from scratch (install Docker, Node, clone repo, deploy)"
    echo "  --dry-run    Pre-flight validation only (no Docker containers)"
    echo "  --update     Pull latest code, migrate .env, rebuild all containers"
    echo "  --ui-only    Run the web UI locally via Next.js dev server (no Docker)"
    echo "  --ui-docker  Build and deploy only the web UI Docker container"
    echo "  (default)    Full staged deploy with post-deploy checks"
    echo ""
    echo "Options:"
    echo "  --skip-ui   Skip npm install and build steps"
    echo "  --help      Show this help message"
    echo ""
    echo "Dry-run checks:"
    echo "  - Prerequisites (docker, curl, node, npm)"
    echo "  - .env file exists and is valid"
    echo "  - docker compose config syntax"
    echo "  - Shell script syntax (bash -n)"
    echo "  - UI build (npm install && npm run build)"
    echo "  - API route validation (starts dev server, curls 12 routes)"
    echo ""
    echo "Deploy stages:"
    echo "  1. gluetun (VPN)           — fail-fast, 60s healthcheck"
    echo "  2. qbittorrent, sabnzbd    — download clients"
    echo "  3. prowlarr, sonarr, radarr, unpackerr — arr stack"
    echo "  4. plex, bazarr, tautulli, seerr — media servers"
    echo "  5. recyclarr, watchtower   — operations"
    echo "  6. media-ui                — unified dashboard"
    exit 0
}

# --- Parse arguments ---
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)  DRY_RUN=1 ;;
        --skip-ui)  SKIP_UI=1 ;;
        --update)   UPDATE_MODE=1 ;;
        --ui-only)  UI_ONLY=1 ;;
        --ui-docker) UI_DOCKER=1 ;;
        --install)  INSTALL_MODE=1 ;;
        --help|-h)  show_help ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            echo "Run '$0 --help' for usage." >&2
            exit 1
            ;;
    esac
    shift
done

# --- Cleanup trap ---
cleanup() {
    if [ -n "$DEV_SERVER_PID" ]; then
        kill "$DEV_SERVER_PID" 2>/dev/null || true
        wait "$DEV_SERVER_PID" 2>/dev/null || true
        DEV_SERVER_PID=""
    fi
}
trap cleanup EXIT INT TERM

# ============================================================
# SHARED FUNCTIONS
# ============================================================

check_prerequisites() {
    section "Prerequisites"
    for cmd in docker curl node npm; do
        if command -v "$cmd" >/dev/null 2>&1; then
            pass "$cmd found: $(command -v "$cmd")"
        else
            fail "$cmd not found on PATH"
        fi
    done
}

find_free_subnet() {
    # List subnets used by existing Docker networks
    _used=$(docker network ls -q | xargs -r docker network inspect \
        --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null)

    # Candidate /24 subnets in the 172.16-31 private range
    for _block in 28 29 30 20 21 22 23 24 25 26 27; do
        _candidate="172.${_block}.0.0/24"
        _conflict=0
        for _existing in $_used; do
            # Simple overlap check: same /16 prefix
            _existing_prefix="${_existing%.*.*}"
            _candidate_prefix="172.${_block}"
            if [ "$_existing_prefix" = "$_candidate_prefix" ]; then
                _conflict=1
                break
            fi
        done
        if [ "$_conflict" = "0" ]; then
            echo "$_candidate"
            return 0
        fi
    done
    # Exhausted all candidates — return the default and hope for the best
    echo "172.28.0.0/24"
    return 1
}

check_env_file() {
    section "Environment"
    ENV_FILE="$PROJECT_DIR/.env"
    if [ -f "$ENV_FILE" ]; then
        pass ".env file found"
        set -a
        . "$ENV_FILE"
        set +a
    else
        if [ "$DRY_RUN" = "1" ]; then
            fail ".env file not found at $ENV_FILE"
            info "Copy .env.example to .env and fill in your values:"
            info "  cp .env.example .env"
        else
            warn ".env file not found — launching setup wizard"
            run_setup_wizard
            # Source the newly created .env
            set -a
            . "$ENV_FILE"
            set +a
        fi
    fi

    # Auto-set HOST_PROJECT_DIR if empty
    if [ -f "$ENV_FILE" ] && [ -z "$HOST_PROJECT_DIR" ]; then
        if grep -q "^HOST_PROJECT_DIR=" "$ENV_FILE"; then
            sed -i "s|^HOST_PROJECT_DIR=.*|HOST_PROJECT_DIR=$PROJECT_DIR|" "$ENV_FILE"
        else
            echo "HOST_PROJECT_DIR=$PROJECT_DIR" >> "$ENV_FILE"
        fi
        HOST_PROJECT_DIR="$PROJECT_DIR"
        pass "Auto-set HOST_PROJECT_DIR=$PROJECT_DIR"
    fi

    # Validate DOCKER_SUBNET doesn't conflict with existing networks
    if [ -f "$ENV_FILE" ] && [ -n "$DOCKER_SUBNET" ] && command -v docker >/dev/null 2>&1; then
        _used=$(docker network ls -q | xargs -r docker network inspect \
            --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null)
        _current_prefix="${DOCKER_SUBNET%.*.*}"
        _has_conflict=0
        for _existing in $_used; do
            _existing_prefix="${_existing%.*.*}"
            if [ "$_existing_prefix" = "$_current_prefix" ]; then
                _has_conflict=1
                break
            fi
        done
        if [ "$_has_conflict" = "1" ]; then
            _new=$(find_free_subnet)
            warn "DOCKER_SUBNET=$DOCKER_SUBNET conflicts with existing network — switching to $_new"
            sed -i "s|^DOCKER_SUBNET=.*|DOCKER_SUBNET=$_new|" "$ENV_FILE"
            DOCKER_SUBNET="$_new"
        else
            pass "DOCKER_SUBNET=$DOCKER_SUBNET (no conflicts)"
        fi
    fi
}

migrate_env() {
    section "Migrate .env"
    ENV_FILE="$PROJECT_DIR/.env"
    ENV_EXAMPLE="$PROJECT_DIR/.env.example"

    if [ ! -f "$ENV_FILE" ]; then
        fail ".env file missing — cannot migrate"
        return
    fi
    if [ ! -f "$ENV_EXAMPLE" ]; then
        fail ".env.example not found — cannot migrate"
        return
    fi

    _added=0
    while IFS= read -r line; do
        # Skip comments and empty lines
        case "$line" in
            "#"*|"") continue ;;
        esac
        # Extract key (everything before first =)
        _key="${line%%=*}"
        # Skip if key is empty or line has no =
        case "$line" in
            *=*) ;;
            *) continue ;;
        esac
        # Check if key exists in .env
        if ! grep -q "^${_key}=" "$ENV_FILE"; then
            echo "$line  # Added by migrate_env" >> "$ENV_FILE"
            pass "Added $_key"
            _added=$((_added + 1))
        fi
    done < "$ENV_EXAMPLE"

    if [ "$_added" -eq 0 ]; then
        info "No new variables to add"
    else
        pass "Added $_added new variable(s) to .env"
    fi
}

validate_env() {
    section "Validate .env"
    ENV_FILE="$PROJECT_DIR/.env"
    if [ ! -f "$ENV_FILE" ]; then
        fail ".env file missing — cannot validate"
        return
    fi

    _valid=1
    for var in VPN_SERVICE_PROVIDER VPN_TYPE WIREGUARD_PRIVATE_KEY WIREGUARD_ADDRESSES DATA_ROOT CONFIG_ROOT BACKUP_DIR; do
        eval _val="\$$var"
        if [ -n "$_val" ]; then
            pass "$var is set"
        else
            fail "$var is empty or missing"
            _valid=0
        fi
    done

    if [ "$_valid" = "1" ]; then
        pass "All required fields present"
    else
        warn "Some required fields are missing — services depending on them may fail to start"
        info "You can configure these later via the web UI Settings page or by editing .env"
    fi
}

run_setup_wizard() {
    section "Setup Wizard"
    info "No .env file found. Let's create one."
    echo ""

    ENV_EXAMPLE="$PROJECT_DIR/.env.example"
    ENV_FILE="$PROJECT_DIR/.env"

    if [ ! -f "$ENV_EXAMPLE" ]; then
        fail ".env.example not found — cannot run wizard"
        exit 1
    fi

    cp "$ENV_EXAMPLE" "$ENV_FILE"
    pass "Copied .env.example → .env"

    # Auto-detect PUID/PGID
    _puid=$(id -u)
    _pgid=$(id -g)

    info "${BOLD}Fields marked (required) must be filled in for deploy to succeed.${RESET}"
    info "Fields marked (optional) can be left blank and configured later."
    echo ""

    _vpn_provider=$(prompt_user "(required) VPN provider (e.g. protonvpn, mullvad, airvpn)" "")
    _wg_key=$(prompt_user "(required) WireGuard private key" "")
    _wg_addr=$(prompt_user "(required) WireGuard address (e.g. 10.2.0.2/32)" "")
    _server_country=$(prompt_user "(optional) Server country (e.g. Netherlands)" "")
    _plex_claim=$(prompt_user "(optional) Plex claim token (from https://plex.tv/claim)" "")
    _data_root=$(prompt_user "(required) DATA_ROOT path" "$HOME/.mmc/data")
    # Expand ~ to $HOME
    case "$_data_root" in "~"*) _data_root="$HOME${_data_root#"~"}" ;; esac
    _config_root=$(prompt_user "(required) CONFIG_ROOT path" "$HOME/.mmc/config")
    case "$_config_root" in "~"*) _config_root="$HOME${_config_root#"~"}" ;; esac
    _backup_dir=$(prompt_user "(required) BACKUP_DIR path" "$HOME/.mmc/backups")
    case "$_backup_dir" in "~"*) _backup_dir="$HOME${_backup_dir#"~"}" ;; esac
    _puid=$(prompt_user "(optional) PUID" "$_puid")
    _pgid=$(prompt_user "(optional) PGID" "$_pgid")

    echo ""

    # Use | as sed delimiter (WireGuard keys contain / and +)
    sed -i "s|^VPN_SERVICE_PROVIDER=.*|VPN_SERVICE_PROVIDER=$_vpn_provider|" "$ENV_FILE"
    sed -i "s|^WIREGUARD_PRIVATE_KEY=.*|WIREGUARD_PRIVATE_KEY=$_wg_key|" "$ENV_FILE"
    sed -i "s|^WIREGUARD_ADDRESSES=.*|WIREGUARD_ADDRESSES=$_wg_addr|" "$ENV_FILE"
    sed -i "s|^SERVER_COUNTRIES=.*|SERVER_COUNTRIES=$_server_country|" "$ENV_FILE"
    sed -i "s|^PLEX_CLAIM=.*|PLEX_CLAIM=$_plex_claim|" "$ENV_FILE"
    sed -i "s|^DATA_ROOT=.*|DATA_ROOT=$_data_root|" "$ENV_FILE"
    sed -i "s|^CONFIG_ROOT=.*|CONFIG_ROOT=$_config_root|" "$ENV_FILE"
    sed -i "s|^BACKUP_DIR=.*|BACKUP_DIR=$_backup_dir|" "$ENV_FILE"
    sed -i "s|^HOST_PROJECT_DIR=.*|HOST_PROJECT_DIR=$PROJECT_DIR|" "$ENV_FILE"
    sed -i "s|^PUID=.*|PUID=$_puid|" "$ENV_FILE"
    sed -i "s|^PGID=.*|PGID=$_pgid|" "$ENV_FILE"

    # Auto-detect a free Docker subnet
    _subnet=$(find_free_subnet)
    sed -i "s|^DOCKER_SUBNET=.*|DOCKER_SUBNET=$_subnet|" "$ENV_FILE"
    pass "DOCKER_SUBNET=$_subnet (auto-detected free range)"

    pass ".env written with your values"
    info "You can edit $ENV_FILE to fine-tune other settings."
}

validate_compose_syntax() {
    section "Docker Compose Syntax"
    cd "$PROJECT_DIR"
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        warn "Skipped — .env file missing (compose cannot resolve variables)"
        return
    fi
    if docker compose config -q 2>/dev/null; then
        pass "docker-compose.yml is valid"
    else
        fail "docker-compose.yml has syntax errors"
    fi
}

check_shell_scripts() {
    section "Shell Script Syntax"
    for script in "$SCRIPT_DIR"/*.sh; do
        _name="$(basename "$script")"
        if bash -n "$script" 2>/dev/null; then
            pass "$_name syntax OK"
        else
            fail "$_name has syntax errors"
        fi
    done
}

build_ui() {
    if [ "$SKIP_UI" = "1" ]; then
        section "UI Build (skipped)"
        info "--skip-ui flag set, skipping npm install and build"
        return
    fi

    section "UI Build"
    cd "$PROJECT_DIR/ui"

    info "Running npm install..."
    if npm install --loglevel=error 2>&1; then
        pass "npm install succeeded"
    else
        fail "npm install failed"
        return
    fi

    info "Running npm run build..."
    if npm run build 2>&1; then
        pass "npm run build succeeded"
    else
        fail "npm run build failed"
    fi
    cd "$PROJECT_DIR"
}

check_ui_api_routes() {
    if [ "$SKIP_UI" = "1" ]; then
        section "API Route Validation (skipped)"
        info "--skip-ui flag set, skipping API route checks"
        return
    fi

    section "API Route Validation (dry-run)"
    cd "$PROJECT_DIR/ui"

    info "Starting Next.js dev server on port 3199..."
    PORT=3199 npm run dev >/dev/null 2>&1 &
    DEV_SERVER_PID=$!

    # Wait for dev server to be ready
    _waited=0
    _max_wait=30
    while [ "$_waited" -lt "$_max_wait" ]; do
        if curl -s -o /dev/null "http://localhost:3199" 2>/dev/null; then
            break
        fi
        sleep 1
        _waited=$((_waited + 1))
    done

    if [ "$_waited" -ge "$_max_wait" ]; then
        fail "Dev server did not start within ${_max_wait}s"
        kill "$DEV_SERVER_PID" 2>/dev/null || true
        wait "$DEV_SERVER_PID" 2>/dev/null || true
        DEV_SERVER_PID=""
        cd "$PROJECT_DIR"
        return
    fi

    pass "Dev server running on port 3199 (PID $DEV_SERVER_PID)"

    API_ROUTES="
/api/health
/api/dashboard/stats
/api/vpn
/api/downloads
/api/calendar
/api/movies
/api/series
/api/recently-added
/api/requests
/api/movies/lookup?term=test
/api/series/lookup?term=test
/api/settings/paths
"
    for route in $API_ROUTES; do
        _response=$(curl -s -m 5 "http://localhost:3199${route}" 2>/dev/null || echo "")
        if [ -z "$_response" ]; then
            warn "$route — no response (service may not be running)"
        elif is_json "$_response"; then
            pass "$route — valid JSON"
        else
            fail "$route — invalid JSON response"
        fi
    done

    # Stop dev server
    kill "$DEV_SERVER_PID" 2>/dev/null || true
    wait "$DEV_SERVER_PID" 2>/dev/null || true
    DEV_SERVER_PID=""
    pass "Dev server stopped"
    cd "$PROJECT_DIR"
}

print_services_summary() {
    _heading="${1:-Installed Services}"
    section "$_heading"

    PORT_UI="${PORT_UI:-3000}"
    PORT_SONARR="${PORT_SONARR:-8989}"
    PORT_RADARR="${PORT_RADARR:-7878}"
    PORT_PROWLARR="${PORT_PROWLARR:-9696}"
    PORT_QBITTORRENT="${PORT_QBITTORRENT:-8080}"
    PORT_SABNZBD="${PORT_SABNZBD:-8081}"
    PORT_PLEX="${PORT_PLEX:-32400}"
    PORT_SEERR="${PORT_SEERR:-5055}"
    PORT_BAZARR="${PORT_BAZARR:-6767}"
    PORT_TAUTULLI="${PORT_TAUTULLI:-8181}"
    PORT_GLUETUN_CONTROL="${PORT_GLUETUN_CONTROL:-8000}"

    printf "\n  ${GREEN}${BOLD}Mars Media Centre${RESET}  ${GREEN}http://localhost:${PORT_UI}${RESET}\n"
    echo ""

    info "${BOLD}Media Management${RESET}"
    info "  Sonarr         http://localhost:${PORT_SONARR}        TV show management"
    info "  Radarr         http://localhost:${PORT_RADARR}        Movie management"
    info "  Prowlarr       http://localhost:${PORT_PROWLARR}        Indexer management"
    info "  Seerr          http://localhost:${PORT_SEERR}        Media requests"
    echo ""

    info "${BOLD}Download Clients${RESET}"
    info "  qBittorrent    http://localhost:${PORT_QBITTORRENT}        Torrent client"
    info "  SABnzbd        http://localhost:${PORT_SABNZBD}        Usenet client"
    echo ""

    info "${BOLD}Media Server${RESET}"
    info "  Plex           http://localhost:${PORT_PLEX}/web    Media streaming"
    info "  Bazarr         http://localhost:${PORT_BAZARR}        Subtitle management"
    info "  Tautulli       http://localhost:${PORT_TAUTULLI}        Plex analytics"
    echo ""

    info "${BOLD}Operations${RESET}"
    info "  Gluetun        http://localhost:${PORT_GLUETUN_CONTROL}        VPN status"
    info "  Recyclarr      (runs on schedule)      Quality profile sync"
    info "  Watchtower      (runs on schedule)      Container auto-update"
    echo ""

    info "${BOLD}Quick Reference${RESET}"
    info "  Stop a service:      docker stop <name>"
    info "  Start a service:     docker start <name>"
    info "  Remove a service:    docker rm -f <name>"
    info "  View logs:           docker logs -f <name>"
    info "  Stop all:            docker compose down"
    info "  Start all:           docker compose up -d"
}

# ============================================================
# DEPLOY-ONLY FUNCTIONS
# ============================================================

run_init() {
    section "Directory Initialisation"
    if [ -x "$SCRIPT_DIR/init.sh" ]; then
        "$SCRIPT_DIR/init.sh"
        pass "init.sh completed"
    else
        fail "init.sh not found or not executable"
    fi
}

detect_first_run() {
    cd "$PROJECT_DIR"
    _count=$(docker compose ps -a -q 2>/dev/null | wc -l)
    if [ "$_count" -eq 0 ]; then
        return 0  # first run
    else
        return 1  # containers exist
    fi
}

cleanup_stale_containers() {
    _containers="$1"
    _found=""

    for _name in $_containers; do
        if docker ps -a -q -f "name=^${_name}$" | grep -q .; then
            _found="${_found} ${_name}"
        fi
    done

    if [ -z "$_found" ]; then
        return
    fi

    warn "Found existing containers from a previous install:${_found}"
    info "Stopping and removing stale containers..."
    for _name in $_found; do
        docker rm -f "$_name" >/dev/null 2>&1
    done
    pass "Stale containers removed"
}

wait_for_port() {
    _port="$1"
    _timeout="$2"
    _waited=0
    while [ "$_waited" -lt "$_timeout" ]; do
        if curl -s -o /dev/null -m 2 "http://localhost:${_port}" 2>/dev/null; then
            return 0
        fi
        sleep 1
        _waited=$((_waited + 1))
    done
    return 1
}

stage_vpn() {
    section "Stage 1: VPN (gluetun)"
    cd "$PROJECT_DIR"
    info "Starting gluetun..."
    docker compose up -d gluetun

    info "Waiting for VPN healthcheck (up to 60s)..."
    _waited=0
    _max=60
    while [ "$_waited" -lt "$_max" ]; do
        _health=$(docker inspect --format='{{.State.Health.Status}}' gluetun 2>/dev/null || echo "unknown")
        if [ "$_health" = "healthy" ]; then
            pass "gluetun is healthy"
            return
        fi
        sleep 2
        _waited=$((_waited + 2))
    done

    fail "gluetun did not become healthy within ${_max}s"
    info "Check VPN credentials in .env and gluetun logs:"
    info "  docker logs gluetun"
    warn "Continuing deploy — VPN-dependent services may not work until VPN is configured"
}

stage_download_clients() {
    section "Stage 2: Download Clients"
    cd "$PROJECT_DIR"
    info "Starting qbittorrent and sabnzbd..."
    docker compose up -d qbittorrent sabnzbd

    sleep 5

    PORT_QBITTORRENT="${PORT_QBITTORRENT:-8080}"
    PORT_SABNZBD="${PORT_SABNZBD:-8081}"

    if wait_for_port "$PORT_QBITTORRENT" 10; then
        pass "qbittorrent responding on port $PORT_QBITTORRENT"
    else
        warn "qbittorrent not responding on port $PORT_QBITTORRENT (may still be starting)"
    fi

    if wait_for_port "$PORT_SABNZBD" 10; then
        pass "sabnzbd responding on port $PORT_SABNZBD"
    else
        warn "sabnzbd not responding on port $PORT_SABNZBD (may still be starting)"
    fi
}

stage_arr_stack() {
    section "Stage 3: Arr Stack"
    cd "$PROJECT_DIR"
    info "Starting prowlarr, sonarr, radarr, unpackerr..."
    docker compose up -d prowlarr sonarr radarr unpackerr

    sleep 10

    PORT_PROWLARR="${PORT_PROWLARR:-9696}"
    PORT_SONARR="${PORT_SONARR:-8989}"
    PORT_RADARR="${PORT_RADARR:-7878}"

    for _svc_port in "prowlarr:$PORT_PROWLARR" "sonarr:$PORT_SONARR" "radarr:$PORT_RADARR"; do
        _svc="${_svc_port%%:*}"
        _port="${_svc_port##*:}"
        if wait_for_port "$_port" 10; then
            pass "$_svc responding on port $_port"
        else
            warn "$_svc not responding on port $_port (may still be starting)"
        fi
    done

    # unpackerr has no web UI — check container is running
    if docker ps --format '{{.Names}}' | grep -q "^unpackerr$"; then
        pass "unpackerr is running"
    else
        warn "unpackerr may not be running"
    fi
}

stage_media_server() {
    section "Stage 4: Media Server"
    cd "$PROJECT_DIR"
    info "Starting plex, bazarr, tautulli, seerr..."
    docker compose up -d plex bazarr tautulli seerr

    sleep 10

    PORT_PLEX="${PORT_PLEX:-32400}"
    PORT_BAZARR="${PORT_BAZARR:-6767}"
    PORT_TAUTULLI="${PORT_TAUTULLI:-8181}"
    PORT_SEERR="${PORT_SEERR:-5055}"

    for _svc_port in "plex:$PORT_PLEX" "bazarr:$PORT_BAZARR" "tautulli:$PORT_TAUTULLI" "seerr:$PORT_SEERR"; do
        _svc="${_svc_port%%:*}"
        _port="${_svc_port##*:}"
        if wait_for_port "$_port" 10; then
            pass "$_svc responding on port $_port"
        else
            warn "$_svc not responding on port $_port (may still be starting)"
        fi
    done
}

stage_operations() {
    section "Stage 5: Operations"
    cd "$PROJECT_DIR"
    info "Starting recyclarr, watchtower..."
    docker compose up -d recyclarr watchtower

    sleep 3

    for _svc in recyclarr watchtower; do
        if docker ps --format '{{.Names}}' | grep -q "^${_svc}$"; then
            pass "$_svc is running"
        else
            warn "$_svc may not be running"
        fi
    done
}

stage_media_ui() {
    section "Stage 6: Media UI"
    cd "$PROJECT_DIR"
    info "Building and starting media-ui..."
    docker compose up -d --build media-ui

    PORT_UI="${PORT_UI:-3000}"
    if wait_for_port "$PORT_UI" 30; then
        pass "media-ui responding on port $PORT_UI"
    else
        warn "media-ui not responding on port $PORT_UI (may still be building)"
    fi
}

quick_deploy() {
    section "Quick Deploy"
    cd "$PROJECT_DIR"
    info "Containers already exist — running docker compose up -d --build..."
    docker compose up -d --build
    pass "docker compose up -d --build completed"
}

check_all_containers() {
    section "Container Status"
    cd "$PROJECT_DIR"

    _expected="gluetun qbittorrent sabnzbd prowlarr sonarr radarr unpackerr plex bazarr tautulli seerr recyclarr watchtower media-ui"
    _running_count=0
    _expected_count=0

    for _svc in $_expected; do
        _expected_count=$((_expected_count + 1))
        _state=$(docker inspect --format='{{.State.Status}}' "$_svc" 2>/dev/null || echo "not found")
        if [ "$_state" = "running" ]; then
            pass "$_svc is running"
            _running_count=$((_running_count + 1))
        else
            fail "$_svc is $_state"
        fi
    done

    info "$_running_count / $_expected_count containers running"
}

check_vpn_connectivity() {
    section "VPN Connectivity"
    _vpn_ip=$(docker exec gluetun wget -qO- https://ipinfo.io 2>/dev/null || echo "")
    if [ -z "$_vpn_ip" ]; then
        fail "Could not reach ipinfo.io via gluetun"
    elif is_json "$_vpn_ip"; then
        pass "VPN connected — ipinfo.io returned valid JSON"
        _ip=$(echo "$_vpn_ip" | grep -o '"ip": *"[^"]*"' | head -1 | cut -d'"' -f4)
        _country=$(echo "$_vpn_ip" | grep -o '"country": *"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$_ip" ]; then
            info "Public IP: $_ip"
        fi
        if [ -n "$_country" ]; then
            info "Country: $_country"
        fi
    else
        warn "ipinfo.io response is not valid JSON"
    fi
}

check_service_ports() {
    section "Service Port Check"
    PORT_QBITTORRENT="${PORT_QBITTORRENT:-8080}"
    PORT_SABNZBD="${PORT_SABNZBD:-8081}"
    PORT_PROWLARR="${PORT_PROWLARR:-9696}"
    PORT_SONARR="${PORT_SONARR:-8989}"
    PORT_RADARR="${PORT_RADARR:-7878}"
    PORT_PLEX="${PORT_PLEX:-32400}"
    PORT_BAZARR="${PORT_BAZARR:-6767}"
    PORT_TAUTULLI="${PORT_TAUTULLI:-8181}"
    PORT_SEERR="${PORT_SEERR:-5055}"
    PORT_GLUETUN_CONTROL="${PORT_GLUETUN_CONTROL:-8000}"
    PORT_UI="${PORT_UI:-3000}"

    for _svc_port in \
        "gluetun:$PORT_GLUETUN_CONTROL" \
        "qbittorrent:$PORT_QBITTORRENT" \
        "sabnzbd:$PORT_SABNZBD" \
        "prowlarr:$PORT_PROWLARR" \
        "sonarr:$PORT_SONARR" \
        "radarr:$PORT_RADARR" \
        "plex:$PORT_PLEX" \
        "bazarr:$PORT_BAZARR" \
        "tautulli:$PORT_TAUTULLI" \
        "seerr:$PORT_SEERR" \
        "media-ui:$PORT_UI"; do
        _svc="${_svc_port%%:*}"
        _port="${_svc_port##*:}"
        if curl -s -o /dev/null -m 3 "http://localhost:${_port}" 2>/dev/null; then
            pass "$_svc on port $_port"
        else
            fail "$_svc not responding on port $_port"
        fi
    done
}

check_ui_api_routes_live() {
    section "UI API Route Validation (live)"
    PORT_UI="${PORT_UI:-3000}"

    API_ROUTES="
/api/health
/api/dashboard/stats
/api/vpn
/api/downloads
/api/calendar
/api/movies
/api/series
/api/recently-added
/api/requests
/api/movies/lookup?term=test
/api/series/lookup?term=test
/api/settings/paths
"
    for route in $API_ROUTES; do
        _response=$(curl -s -m 5 "http://localhost:${PORT_UI}${route}" 2>/dev/null || echo "")
        if [ -z "$_response" ]; then
            fail "$route — no response"
        elif is_json "$_response"; then
            pass "$route — valid JSON"
        else
            fail "$route — invalid JSON response"
        fi
    done
}

# --- Summary ---
check_missing_required_vars() {
    # Returns a space-separated list of missing required .env vars
    _missing=""
    ENV_FILE="$PROJECT_DIR/.env"
    if [ ! -f "$ENV_FILE" ]; then
        echo "VPN_SERVICE_PROVIDER VPN_TYPE WIREGUARD_PRIVATE_KEY WIREGUARD_ADDRESSES DATA_ROOT CONFIG_ROOT BACKUP_DIR"
        return
    fi
    set -a
    . "$ENV_FILE"
    set +a
    for var in VPN_SERVICE_PROVIDER VPN_TYPE WIREGUARD_PRIVATE_KEY WIREGUARD_ADDRESSES DATA_ROOT CONFIG_ROOT BACKUP_DIR; do
        eval _val="\$$var"
        if [ -z "$_val" ]; then
            _missing="$_missing $var"
        fi
    done
    echo "$_missing"
}

print_summary() {
    section "Summary"
    printf "  ${GREEN}Passed: %d${RESET}\n" "$PASS_COUNT"
    printf "  ${YELLOW}Warnings: %d${RESET}\n" "$WARN_COUNT"
    printf "  ${RED}Failed: %d${RESET}\n" "$FAIL_COUNT"
    echo ""

    # Determine actual outcome based on service state, not just counters
    PORT_UI="${PORT_UI:-3000}"
    _ui_up=0
    if curl -s -o /dev/null -m 3 "http://localhost:${PORT_UI}" 2>/dev/null; then
        _ui_up=1
    fi

    _missing_vars=$(check_missing_required_vars)

    if [ "$_ui_up" = "1" ] && [ -z "$_missing_vars" ] && [ "$FAIL_COUNT" -eq 0 ]; then
        # Everything working
        printf "  ${GREEN}${BOLD}✓ DEPLOY COMPLETE${RESET}\n"
        info "Mars Media Centre is ready at http://localhost:${PORT_UI}"
    elif [ "$_ui_up" = "1" ] && { [ -n "$_missing_vars" ] || [ "$FAIL_COUNT" -gt 0 ]; }; then
        # UI running but services need attention
        printf "  ${YELLOW}${BOLD}⚠ DEPLOY INCOMPLETE — configuration needed${RESET}\n"
        info "The web UI is running but some services failed to start."
        echo ""
        info "${BOLD}Next steps:${RESET}"
        info "  1. Open http://localhost:${PORT_UI}/settings to configure missing settings"
        if [ -n "$_missing_vars" ]; then
            info "  2. Required fields still empty:${_missing_vars}"
        fi
        info "  3. After updating settings, restart services from the web UI"
        info "     Service Control tab, or re-run: ./scripts/deploy.sh"
    else
        # UI didn't come up
        printf "  ${RED}${BOLD}✗ DEPLOY FAILED — web UI did not start${RESET}\n"
        info "Fix the errors above and re-run: ./scripts/deploy.sh"
    fi

    echo ""
    if [ -n "$_MMC_LOGGED" ]; then
        info "Full log: $_MMC_LOGGED"
    fi
}

# ============================================================
# INSTALL / BOOTSTRAP FUNCTIONS
# ============================================================

detect_wsl() {
    if grep -qi microsoft /proc/version 2>/dev/null; then
        return 0
    fi
    return 1
}

install_docker() {
    section "Install Docker"
    if command -v docker >/dev/null 2>&1; then
        pass "Docker already installed: $(docker --version)"
        # Check docker compose plugin
        if docker compose version >/dev/null 2>&1; then
            pass "Docker Compose plugin available"
        else
            info "Installing Docker Compose plugin..."
            sudo apt-get update -qq
            sudo apt-get install -y -qq docker-compose-plugin
            pass "Docker Compose plugin installed"
        fi
        return
    fi

    info "Docker not found — installing Docker Engine..."
    echo ""

    # Install via official convenience script
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL https://get.docker.com | sudo sh
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- https://get.docker.com | sudo sh
    else
        fail "Neither curl nor wget found — cannot install Docker"
        info "Install Docker manually: https://docs.docker.com/engine/install/"
        exit 1
    fi

    # Add current user to docker group (avoids needing sudo)
    sudo usermod -aG docker "$USER"
    pass "Docker installed and user added to docker group"

    # Start Docker daemon if not running (common in WSL without systemd)
    if ! docker info >/dev/null 2>&1; then
        info "Starting Docker daemon..."
        sudo service docker start 2>/dev/null || sudo dockerd &
        sleep 3
    fi

    if docker info >/dev/null 2>&1; then
        pass "Docker daemon is running"
    else
        warn "Docker installed but daemon may need a new shell session to work without sudo"
        info "If docker commands fail, log out and back in, or run: newgrp docker"
    fi
}

install_node() {
    section "Install Node.js"
    if command -v node >/dev/null 2>&1; then
        _node_ver=$(node --version)
        _major=$(echo "$_node_ver" | sed 's/^v//' | cut -d. -f1)
        if [ "$_major" -ge 18 ]; then
            pass "Node.js already installed: $_node_ver"
            return
        else
            warn "Node.js $_node_ver is too old (need v18+) — upgrading..."
        fi
    else
        info "Node.js not found — installing..."
    fi

    # Install Node.js 20.x via NodeSource
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- https://deb.nodesource.com/setup_20.x | sudo -E bash -
    else
        fail "Neither curl nor wget found — cannot install Node.js"
        exit 1
    fi

    sudo apt-get install -y -qq nodejs
    pass "Node.js installed: $(node --version)"
    pass "npm installed: $(npm --version)"
}

install_git() {
    if command -v git >/dev/null 2>&1; then
        return
    fi

    info "Installing git..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq git
    pass "git installed"
}

install_curl() {
    # curl is needed for deploy checks; if we got here via curl it exists,
    # but handle the case where wget was used or script was run directly
    if command -v curl >/dev/null 2>&1; then
        return
    fi

    info "Installing curl..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq curl
    pass "curl installed"
}

INSTALL_MARKER="$HOME/.mmc/install-path"

clone_repo() {
    section "Clone Repository"

    # Check marker file for existing install location
    if [ -f "$INSTALL_MARKER" ]; then
        _existing=$(cat "$INSTALL_MARKER")
        if [ -d "$_existing/.git" ]; then
            pass "Existing install found at $_existing"
            cd "$_existing"
            info "Pulling latest changes..."
            git pull
            return
        else
            warn "Marker points to $_existing but repo not found — will clone fresh"
        fi
    fi

    # Check default location in current directory
    if [ -d "$DEFAULT_INSTALL_DIR/.git" ]; then
        pass "Repository already exists at $DEFAULT_INSTALL_DIR"
        cd "$DEFAULT_INSTALL_DIR"
        info "Pulling latest changes..."
        git pull
        # Save marker
        mkdir -p "$(dirname "$INSTALL_MARKER")"
        echo "$DEFAULT_INSTALL_DIR" > "$INSTALL_MARKER"
        return
    fi

    info "Cloning $REPO_URL → $DEFAULT_INSTALL_DIR"
    git clone "$REPO_URL" "$DEFAULT_INSTALL_DIR"
    pass "Repository cloned to $DEFAULT_INSTALL_DIR"
    cd "$DEFAULT_INSTALL_DIR"

    # Save install location for future re-runs
    mkdir -p "$(dirname "$INSTALL_MARKER")"
    echo "$DEFAULT_INSTALL_DIR" > "$INSTALL_MARKER"
}

run_install() {
    section "Mars Media Centre — Install"
    echo ""
    printf "  ${BOLD}Welcome to Mars Media Centre!${RESET}\n"
    echo ""

    if detect_wsl; then
        pass "Running on WSL"
        info "Tip: Add this to C:\\Users\\<you>\\.wslconfig to keep containers running:"
        info "  [wsl2]"
        info "  vmIdleTimeout=-1"
        echo ""
    else
        info "Running on Linux"
    fi

    # Ensure basic tools
    install_curl
    install_git
    install_docker
    install_node

    # Clone the repo
    clone_repo

    # Re-exec from the cloned repo's deploy script (full deploy)
    _cloned_dir="$(pwd)"
    info "Handing off to full deploy..."
    echo ""
    exec "$_cloned_dir/scripts/deploy.sh"
}

# ============================================================
# MAIN
# ============================================================

setup_colors

if [ "$INSTALL_MODE" = "1" ]; then
    run_install
    # run_install execs into the cloned deploy.sh — should not reach here
    exit 0
elif [ "$UI_ONLY" = "1" ]; then
    section "Mars Media Centre — UI Only"

    cd "$PROJECT_DIR/ui"

    info "Installing dependencies..."
    if npm install --loglevel=error 2>&1; then
        pass "npm install succeeded"
    else
        fail "npm install failed"
        print_summary
        exit 1
    fi

    PORT_UI="${PORT_UI:-3000}"
    echo ""
    info "Starting Mars Media Centre UI on http://localhost:${PORT_UI}"
    info "Press Ctrl+C to stop"
    echo ""
    PORT="$PORT_UI" exec npm run dev
elif [ "$UI_DOCKER" = "1" ]; then
    section "Mars Media Centre — UI Docker Deploy"

    check_env_file
    validate_compose_syntax

    section "Build & Deploy UI Container"
    cd "$PROJECT_DIR"
    cleanup_stale_containers "media-ui"
    info "Building and starting media-ui..."
    docker compose up -d --build --no-deps media-ui

    PORT_UI="${PORT_UI:-3000}"
    if wait_for_port "$PORT_UI" 30; then
        pass "media-ui responding on port $PORT_UI"
    else
        warn "media-ui not responding on port $PORT_UI (may still be building)"
    fi

    section "Installed Services"
    printf "\n  ${GREEN}${BOLD}Mars Media Centre${RESET}  ${GREEN}http://localhost:${PORT_UI}${RESET}\n\n"

    info "${BOLD}Quick Reference${RESET}"
    info "  Stop:       docker stop media-ui"
    info "  Start:      docker start media-ui"
    info "  Remove:     docker rm -f media-ui"
    info "  View logs:  docker logs -f media-ui"
    echo ""

    print_summary
elif [ "$UPDATE_MODE" = "1" ]; then
    section "Mars Media Centre — Update"

    info "Pulling latest code..."
    cd "$PROJECT_DIR"
    if git pull; then
        pass "git pull succeeded"
    else
        fail "git pull failed"
        exit 1
    fi

    check_env_file
    migrate_env
    # Re-source .env after migration
    set -a
    . "$PROJECT_DIR/.env"
    set +a
    validate_env
    validate_compose_syntax
    check_shell_scripts

    section "Rebuild & Restart"
    cd "$PROJECT_DIR"
    cleanup_stale_containers "gluetun qbittorrent sabnzbd prowlarr sonarr radarr unpackerr plex bazarr tautulli seerr recyclarr watchtower media-ui"
    info "Running docker compose up -d --build..."
    docker compose up -d --build
    pass "docker compose up -d --build completed"

    section "Post-Update Validation"
    check_all_containers
    check_service_ports
    check_ui_api_routes_live
    print_services_summary
    print_summary
elif [ "$DRY_RUN" = "1" ]; then
    section "Mars Media Centre — Dry Run"
    info "Pre-flight validation (no containers will be started)"

    check_prerequisites
    check_env_file
    validate_compose_syntax
    check_shell_scripts
    build_ui
    check_ui_api_routes
    print_services_summary "Services (will be deployed)"
    print_summary
else
    section "Mars Media Centre — Deploy"

    check_prerequisites
    check_env_file
    validate_env
    validate_compose_syntax
    check_shell_scripts
    run_init
    build_ui

    cleanup_stale_containers "gluetun qbittorrent sabnzbd prowlarr sonarr radarr unpackerr plex bazarr tautulli seerr recyclarr watchtower media-ui"
    if detect_first_run; then
        info "First run detected — starting staged deploy"

        # Deploy services in stages; failures are logged but don't block media-ui
        set +e
        stage_vpn
        stage_download_clients
        stage_arr_stack
        stage_media_server
        stage_operations
        set -e

        # Always deploy the web UI so users can access settings
        stage_media_ui
    else
        quick_deploy
    fi

    section "Post-Deploy Validation"
    check_all_containers
    check_vpn_connectivity
    check_service_ports
    check_ui_api_routes_live
    print_services_summary
    print_summary
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi
exit 0
