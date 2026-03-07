#!/bin/sh
# ============================================================
# deploy.sh — Pre-flight validation and staged deployment
# ============================================================
# Usage: ./scripts/deploy.sh [--dry-run] [--skip-ui] [--ui-only] [--update] [--help]
#
# Modes:
#   --dry-run   Validate build, configs, and API routes
#               without starting Docker containers.
#   --update    Pull latest code, migrate .env, rebuild all containers.
#   --ui-only   Build and deploy only the web UI container.
#   (default)   Full staged deploy with post-deploy checks.
#
# Options:
#   --skip-ui   Skip npm install / build (both modes)
#   --help      Print usage and exit
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# --- Defaults ---
DRY_RUN=0
SKIP_UI=0
UPDATE_MODE=0
UI_ONLY=0
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
DEV_SERVER_PID=""

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
    echo "Usage: $0 [--dry-run] [--skip-ui] [--ui-only] [--update] [--help]"
    echo ""
    echo "Modes:"
    echo "  --dry-run   Pre-flight validation only (no Docker containers)"
    echo "  --update    Pull latest code, migrate .env, rebuild all containers"
    echo "  --ui-only   Build and deploy only the web UI container"
    echo "  (default)   Full staged deploy with post-deploy checks"
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
    elif [ "$DRY_RUN" = "0" ]; then
        fail "Cannot deploy with missing required fields — fix .env and re-run"
        exit 1
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

    printf "  VPN provider (e.g. protonvpn, mullvad, airvpn): "
    read -r _vpn_provider
    printf "  WireGuard private key: "
    read -r _wg_key
    printf "  WireGuard address (e.g. 10.2.0.2/32): "
    read -r _wg_addr
    printf "  Server country (e.g. Netherlands): "
    read -r _server_country
    printf "  Plex claim token (from https://plex.tv/claim): "
    read -r _plex_claim
    printf "  DATA_ROOT path [%s/.mmc/data]: " "$HOME"
    read -r _data_root
    _data_root="${_data_root:-$HOME/.mmc/data}"
    # Expand ~ to $HOME
    case "$_data_root" in "~"*) _data_root="$HOME${_data_root#"~"}" ;; esac
    printf "  CONFIG_ROOT path [%s/.mmc/config]: " "$HOME"
    read -r _config_root
    _config_root="${_config_root:-$HOME/.mmc/config}"
    case "$_config_root" in "~"*) _config_root="$HOME${_config_root#"~"}" ;; esac
    printf "  BACKUP_DIR path [%s/.mmc/backups]: " "$HOME"
    read -r _backup_dir
    _backup_dir="${_backup_dir:-$HOME/.mmc/backups}"
    case "$_backup_dir" in "~"*) _backup_dir="$HOME${_backup_dir#"~"}" ;; esac
    printf "  PUID [%s]: " "$_puid"
    read -r _puid_input
    _puid="${_puid_input:-$_puid}"
    printf "  PGID [%s]: " "$_pgid"
    read -r _pgid_input
    _pgid="${_pgid_input:-$_pgid}"

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

print_manual_check_urls() {
    section "Manual Testing URLs"
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

    info "Verify responsive design at these URLs:"
    echo ""
    info "  Media UI:      http://localhost:${PORT_UI}"
    info "  Sonarr:        http://localhost:${PORT_SONARR}"
    info "  Radarr:        http://localhost:${PORT_RADARR}"
    info "  Prowlarr:      http://localhost:${PORT_PROWLARR}"
    info "  qBittorrent:   http://localhost:${PORT_QBITTORRENT}"
    info "  SABnzbd:       http://localhost:${PORT_SABNZBD}"
    info "  Plex:          http://localhost:${PORT_PLEX}/web"
    info "  Seerr:         http://localhost:${PORT_SEERR}"
    info "  Bazarr:        http://localhost:${PORT_BAZARR}"
    info "  Tautulli:      http://localhost:${PORT_TAUTULLI}"
    info "  Gluetun:       http://localhost:${PORT_GLUETUN_CONTROL}/v1/openvpn/status"
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

    fail "gluetun did not become healthy within ${_max}s — aborting"
    info "Check VPN credentials in .env and gluetun logs:"
    info "  docker logs gluetun"
    exit 1
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
print_summary() {
    section "Summary"
    printf "  ${GREEN}Passed: %d${RESET}\n" "$PASS_COUNT"
    printf "  ${YELLOW}Warnings: %d${RESET}\n" "$WARN_COUNT"
    printf "  ${RED}Failed: %d${RESET}\n" "$FAIL_COUNT"
    echo ""

    if [ "$FAIL_COUNT" -gt 0 ]; then
        printf "  ${RED}${BOLD}RESULT: FAIL${RESET}\n"
    elif [ "$WARN_COUNT" -gt 0 ]; then
        printf "  ${YELLOW}${BOLD}RESULT: PASS (with warnings)${RESET}\n"
    else
        printf "  ${GREEN}${BOLD}RESULT: PASS${RESET}\n"
    fi
}

# ============================================================
# MAIN
# ============================================================

setup_colors

if [ "$UI_ONLY" = "1" ]; then
    section "Mars Media Centre — UI Deploy"

    check_env_file
    validate_compose_syntax

    section "Build & Deploy UI"
    cd "$PROJECT_DIR"
    info "Building and starting media-ui..."
    docker compose up -d --build media-ui

    PORT_UI="${PORT_UI:-3000}"
    if wait_for_port "$PORT_UI" 30; then
        pass "media-ui responding on port $PORT_UI"
    else
        warn "media-ui not responding on port $PORT_UI (may still be building)"
    fi

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
    info "Running docker compose up -d --build..."
    docker compose up -d --build
    pass "docker compose up -d --build completed"

    section "Post-Update Validation"
    check_all_containers
    check_service_ports
    check_ui_api_routes_live
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
    print_manual_check_urls
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

    if detect_first_run; then
        info "First run detected — starting staged deploy"

        stage_vpn
        stage_download_clients
        stage_arr_stack
        stage_media_server
        stage_operations
        stage_media_ui
    else
        quick_deploy
    fi

    section "Post-Deploy Validation"
    check_all_containers
    check_vpn_connectivity
    check_service_ports
    check_ui_api_routes_live
    print_manual_check_urls
    print_summary
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi
exit 0
