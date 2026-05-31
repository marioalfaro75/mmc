#!/bin/sh
# ============================================================
# uninstall.sh — Remove Mars Media Centre cleanly
# ============================================================
# Default is a dry-run preview. Pass --yes to apply.
#
# Tier 1 (default, MMC-only):
#   * stop+rm the 12 MMC containers, networks, locally-built image
#   * rm ~/.mmc/{config,logs,install-path,.nas-credentials}
#   * rm the cloned repo dir (includes .env with the WireGuard key)
#   * rm /etc/systemd/system/mmc.service if installed
#   * unmount and remove fstab line for the NAS mount, if used
#
# Opt-in flags:
#   --remove-images           Also remove pulled vendor images
#   --purge-data              Also rm DATA_ROOT (typed-DELETE prompt)
#   --purge-backups           Also rm BACKUP_DIR (typed-DELETE prompt)
#   --remove-docker           apt-remove Docker + repo + group
#   --wipe-docker-data        Also rm -rf /var/lib/docker (with --remove-docker)
#   --remove-node             apt-remove Node.js + NodeSource repo
#   --remove-nas-packages     apt-remove nfs-common cifs-utils smbclient
#   --force                   Skip "other docker artifacts" safety guard
#   --yes                     Actually execute (otherwise dry-run)
#   --help | -h               Show this message
# ============================================================

set -e

# --- Self-copy to /tmp -----------------------------------------------------
# We're about to delete the repo we live in. Copy ourselves to /tmp and
# re-exec from there so the script doesn't pull the rug out mid-run.
# Done FIRST, before arg parsing, so "$@" still holds the original args.
if [ -z "$_MMC_UNINSTALL_REEXEC" ]; then
    _self="$(readlink -f "$0" 2>/dev/null || echo "$0")"
    case "$_self" in
        */scripts/uninstall.sh)
            _tmp_copy="/tmp/mmc-uninstall-$$.sh"
            cp "$_self" "$_tmp_copy"
            chmod +x "$_tmp_copy"
            export _MMC_UNINSTALL_REEXEC="$_tmp_copy"
            export _MMC_UNINSTALL_ORIG_SELF="$0"
            exec "$_tmp_copy" "$@"
            ;;
    esac
fi
# Clean the /tmp copy on any exit path
trap '[ -n "$_MMC_UNINSTALL_REEXEC" ] && rm -f "$_MMC_UNINSTALL_REEXEC"' EXIT INT TERM

# --- Defaults --------------------------------------------------------------
DRY_RUN=1
REMOVE_IMAGES=0
PURGE_DATA=0
PURGE_BACKUPS=0
REMOVE_DOCKER=0
WIPE_DOCKER_DATA=0
REMOVE_NODE=0
REMOVE_NAS_PACKAGES=0
FORCE=0

# MMC's footprint (kept in one place so it's easy to audit)
MMC_CONTAINERS="gluetun qbittorrent sabnzbd prowlarr sonarr radarr unpackerr bazarr seerr recyclarr watchtower media-ui"
MMC_NETWORKS="mmc_medianet mmc_default"
MMC_BUILT_IMAGES="mmc-media-ui:latest"
MMC_IMAGE_VARS="IMAGE_GLUETUN IMAGE_QBITTORRENT IMAGE_SABNZBD IMAGE_PROWLARR IMAGE_SONARR IMAGE_RADARR IMAGE_UNPACKERR IMAGE_BAZARR IMAGE_SEERR IMAGE_RECYCLARR IMAGE_WATCHTOWER"

# --- Parse args ------------------------------------------------------------
show_help() {
    cat <<'EOF'
uninstall.sh — Remove Mars Media Centre cleanly

Default is a dry-run preview. Pass --yes to apply.

Tier 1 (default, MMC-only):
  * stop+rm the 12 MMC containers, networks, locally-built image
  * rm ~/.mmc/{config,logs,install-path,.nas-credentials}
  * rm the cloned repo dir (includes .env with the WireGuard key)
  * rm /etc/systemd/system/mmc.service if installed
  * unmount and remove fstab line for the NAS mount, if used

Opt-in flags:
  --remove-images           Also remove pulled vendor images
  --purge-data              Also rm DATA_ROOT (typed-DELETE prompt)
  --purge-backups           Also rm BACKUP_DIR (typed-DELETE prompt)
  --remove-docker           apt-remove Docker + repo + group
  --wipe-docker-data        Also rm -rf /var/lib/docker (with --remove-docker)
  --remove-node             apt-remove Node.js + NodeSource repo
  --remove-nas-packages     apt-remove nfs-common cifs-utils smbclient
  --force                   Skip "other docker artifacts" safety guard
  --yes                     Actually execute (otherwise dry-run)
  --help | -h               Show this message
EOF
    exit 0
}

while [ $# -gt 0 ]; do
    case "$1" in
        --yes)                 DRY_RUN=0 ;;
        --remove-images)       REMOVE_IMAGES=1 ;;
        --purge-data)          PURGE_DATA=1 ;;
        --purge-backups)       PURGE_BACKUPS=1 ;;
        --remove-docker)       REMOVE_DOCKER=1 ;;
        --wipe-docker-data)    WIPE_DOCKER_DATA=1 ;;
        --remove-node)         REMOVE_NODE=1 ;;
        --remove-nas-packages) REMOVE_NAS_PACKAGES=1 ;;
        --force)               FORCE=1 ;;
        --help|-h)             show_help ;;
        *) echo "ERROR: Unknown option: $1" >&2; echo "Run '${_MMC_UNINSTALL_ORIG_SELF:-$0} --help' for usage." >&2; exit 1 ;;
    esac
    shift
done

if [ "$WIPE_DOCKER_DATA" = "1" ] && [ "$REMOVE_DOCKER" = "0" ]; then
    echo "ERROR: --wipe-docker-data requires --remove-docker." >&2
    exit 1
fi

# --- Colours and output helpers --------------------------------------------
if [ -t 1 ]; then
    GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'
    BOLD='\033[1m'; RESET='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; BOLD=''; RESET=''
fi
section() { echo ""; printf "${BOLD}=== %s ===${RESET}\n" "$1"; echo ""; }
ok()      { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
plan()    { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
skip()    { printf "  ${YELLOW}-${RESET} %s\n" "$1"; }
warn()    { printf "  ${YELLOW}⚠${RESET} %s\n" "$1"; }
fail()    { printf "  ${RED}✗${RESET} %s\n" "$1"; }
info()    { printf "  %s\n" "$1"; }

# --- Locate the install ----------------------------------------------------
INSTALL_MARKER="$HOME/.mmc/install-path"
if [ -f "$INSTALL_MARKER" ]; then
    REPO_DIR="$(cat "$INSTALL_MARKER" 2>/dev/null || true)"
fi
[ -z "$REPO_DIR" ] && REPO_DIR="$HOME/mmc"
ENV_FILE="$REPO_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a
    . "$ENV_FILE" 2>/dev/null || true
    set +a
fi

DATA_ROOT="${DATA_ROOT:-$HOME/.mmc/data}"
CONFIG_ROOT="${CONFIG_ROOT:-$HOME/.mmc/config}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.mmc/backups}"
case "$DATA_ROOT"   in "~"*) DATA_ROOT="$HOME${DATA_ROOT#"~"}" ;; esac
case "$CONFIG_ROOT" in "~"*) CONFIG_ROOT="$HOME${CONFIG_ROOT#"~"}" ;; esac
case "$BACKUP_DIR"  in "~"*) BACKUP_DIR="$HOME${BACKUP_DIR#"~"}" ;; esac

# --- Small helpers ---------------------------------------------------------
size_of() {
    if [ -e "$1" ]; then
        du -sh "$1" 2>/dev/null | awk '{print $1}'
    else
        echo "—"
    fi
}

is_mount() { mountpoint -q "$1" 2>/dev/null; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

# rm -rf with a sudo fallback. Past `git pull`s run from inside the
# media-ui container land objects in .git/ owned by root on the host;
# user-level rm fails on those, but we don't want to swallow it —
# retry once via sudo so the cleanup actually completes.
safe_rm() {
    _target="$1"
    [ -e "$_target" ] || return 0
    if rm -rf "$_target" 2>/dev/null && [ ! -e "$_target" ]; then
        return 0
    fi
    if [ -e "$_target" ]; then
        warn "Some files in $_target are root-owned (likely from sidecar git pulls). Retrying with sudo…"
        sudo rm -rf "$_target"
    fi
    [ ! -e "$_target" ]
}

# Run a command. In dry-run, just print it. Otherwise execute.
run() {
    if [ "$DRY_RUN" = "1" ]; then
        info "would run: $*"
    else
        # shellcheck disable=SC2068
        eval "$@"
    fi
}

confirm_delete() {
    _label="$1"
    _path="$2"
    _size="$3"
    printf "\n${YELLOW}${BOLD}DANGER${RESET}: about to delete %s (%s).\n" "$_label" "$_size" >/dev/tty
    printf "  Path: %s\n" "$_path" >/dev/tty
    printf "  Type ${BOLD}DELETE${RESET} to confirm (anything else cancels): " >/dev/tty
    read -r _answer </dev/tty
    [ "$_answer" = "DELETE" ]
}

# Resolve $IMAGE_FOO refs into a space-separated list of images
resolve_pulled_images() {
    _out=""
    for _v in $MMC_IMAGE_VARS; do
        eval _img="\$$_v"
        [ -n "$_img" ] && _out="$_out $_img"
    done
    echo "$_out"
}

# --- Detect "other Docker artifacts" on the host ---------------------------
# Used by --remove-docker to refuse if the user has other stuff Dockerised.
detect_other_docker() {
    have_cmd docker || return 1
    docker info >/dev/null 2>&1 || return 1
    _all=$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')
    _mmc_pat=$(echo "$MMC_CONTAINERS" | tr ' ' '|')
    _mine=$(docker ps -aq --filter "name=^(${_mmc_pat})$" 2>/dev/null | wc -l | tr -d ' ')
    [ "$_all" -gt "$_mine" ]
}

# ============================================================
# Pre-flight: refuse to run from inside a doomed directory
# ============================================================
# The script itself self-copies to /tmp so it can survive deleting its
# own repo, but the *user's shell* keeps its CWD. If that CWD is inside
# anything we're about to nuke (the repo dir or ~/.mmc), the shell ends
# up in an orphaned directory after the run — `pwd` looks broken, `ls`
# shows nothing — until they cd somewhere real. Refuse with a clear
# message instead. Dry-run is allowed from anywhere (it deletes nothing).
if [ "$DRY_RUN" = "0" ]; then
    _real_pwd="$(readlink -f "$PWD" 2>/dev/null || echo "$PWD")"
    _real_repo="$(readlink -f "$REPO_DIR" 2>/dev/null || echo "$REPO_DIR")"
    _real_mmc="$(readlink -f "$HOME/.mmc" 2>/dev/null || echo "$HOME/.mmc")"

    _inside=""
    case "$_real_pwd" in
        "$_real_repo"|"$_real_repo"/*) _inside="$_real_repo (the repo dir)" ;;
        "$_real_mmc"|"$_real_mmc"/*)   _inside="$_real_mmc (runtime state)" ;;
    esac

    if [ -n "$_inside" ]; then
        printf "\n${RED}${BOLD}✗ Refusing to run from inside ${_inside}${RESET}\n\n"
        printf "  Your current directory (${BOLD}%s${RESET}) would be deleted\n" "$_real_pwd"
        printf "  mid-run, leaving your shell in an orphaned state.\n\n"
        printf "  ${BOLD}Fix${RESET}: move out first, then re-run from anywhere:\n\n"
        printf "    cd ~\n"
        printf "    %s <same flags as before>\n\n" "${_MMC_UNINSTALL_ORIG_SELF:-$0}"
        exit 1
    fi
fi

# ============================================================
# Plan & execute
# ============================================================

if [ "$DRY_RUN" = "1" ]; then
    section "Mars Media Centre — Uninstall (dry-run)"
    info "No changes will be made. Re-run with ${BOLD}--yes${RESET} to apply."
else
    section "Mars Media Centre — Uninstall"
fi

info "Install location:  $REPO_DIR"
info "Data root:         $DATA_ROOT"
info "Config root:       $CONFIG_ROOT"
info "Backup dir:        $BACKUP_DIR"

# --- Tier 1: containers, networks, built image -----------------------------
section "Containers, networks, locally-built image"

if have_cmd docker && docker info >/dev/null 2>&1; then
    _running=$(docker ps -aq --filter "name=^($(echo "$MMC_CONTAINERS" | tr ' ' '|'))$" 2>/dev/null | wc -l | tr -d ' ')
    plan "Stop and remove $_running MMC container(s)"
    if [ "$DRY_RUN" = "0" ]; then
        # Prefer compose down so dependencies are unwound cleanly. Fall back
        # to per-container rm -f if compose can't be invoked (e.g. .env gone).
        if [ -f "$REPO_DIR/docker-compose.yml" ] && [ -f "$ENV_FILE" ]; then
            (cd "$REPO_DIR" && docker compose down --remove-orphans 2>&1) || true
        fi
        for _c in $MMC_CONTAINERS; do
            docker rm -f "$_c" >/dev/null 2>&1 || true
        done
        ok "Containers removed"
    fi

    plan "Remove networks: $MMC_NETWORKS"
    if [ "$DRY_RUN" = "0" ]; then
        for _n in $MMC_NETWORKS; do
            docker network rm "$_n" >/dev/null 2>&1 || true
        done
        ok "Networks removed (any missing were already gone)"
    fi

    for _img in $MMC_BUILT_IMAGES; do
        _exists=$(docker image inspect "$_img" >/dev/null 2>&1 && echo yes || echo no)
        if [ "$_exists" = "yes" ]; then
            plan "Remove locally-built image: $_img"
            if [ "$DRY_RUN" = "0" ]; then
                docker rmi "$_img" >/dev/null 2>&1 || warn "Could not remove $_img (still in use?)"
            fi
        else
            skip "Image $_img not present"
        fi
    done
else
    warn "Docker not reachable — skipping container/network/image steps"
fi

# --- Tier 2 (opt-in): pulled vendor images ---------------------------------
if [ "$REMOVE_IMAGES" = "1" ]; then
    section "Pulled vendor images (--remove-images)"
    _imgs=$(resolve_pulled_images)
    if have_cmd docker && docker info >/dev/null 2>&1; then
        for _img in $_imgs; do
            if docker image inspect "$_img" >/dev/null 2>&1; then
                plan "Remove $_img"
                if [ "$DRY_RUN" = "0" ]; then
                    docker rmi "$_img" >/dev/null 2>&1 \
                        || warn "Could not remove $_img (still in use by another container — left alone)"
                fi
            fi
        done
    else
        warn "Docker not reachable — skipping image removal"
    fi
fi

# --- NAS unmount + fstab cleanup -------------------------------------------
section "NAS mount cleanup"

_nas_unmounted=0
if is_mount "$DATA_ROOT"; then
    plan "Unmount $DATA_ROOT"
    if [ "$DRY_RUN" = "0" ]; then
        if sudo umount "$DATA_ROOT" 2>&1; then
            ok "Unmounted"
            _nas_unmounted=1
        else
            warn "umount failed — leaving fstab entry alone for safety"
        fi
    fi
fi

if [ -f /etc/fstab ] && grep -qF " $DATA_ROOT " /etc/fstab 2>/dev/null; then
    plan "Remove fstab line(s) referencing $DATA_ROOT"
    if [ "$DRY_RUN" = "0" ]; then
        # Delete only lines whose 2nd field is exactly DATA_ROOT
        sudo sed -i "\|[[:space:]]${DATA_ROOT}[[:space:]]|d" /etc/fstab
        ok "fstab cleaned"
    fi
elif [ "$_nas_unmounted" = "0" ]; then
    skip "No NAS mount or fstab entry to clean"
fi

# Remove SMB credentials file if present
if [ -f "$HOME/.mmc/.nas-credentials" ]; then
    plan "Remove $HOME/.mmc/.nas-credentials"
    [ "$DRY_RUN" = "0" ] && rm -f "$HOME/.mmc/.nas-credentials" && ok "Removed"
fi

# --- Tier 1: ~/.mmc subdirs and repo ---------------------------------------
section "MMC files"

for _p in "$CONFIG_ROOT" "$HOME/.mmc/logs" "$INSTALL_MARKER"; do
    if [ -e "$_p" ]; then
        _sz=$(size_of "$_p")
        plan "Remove $_p ($_sz)"
        if [ "$DRY_RUN" = "0" ]; then
            if safe_rm "$_p"; then
                ok "Removed"
            else
                fail "Could not fully remove $_p"
            fi
        fi
    fi
done

if [ -d "$REPO_DIR" ]; then
    _sz=$(size_of "$REPO_DIR")
    plan "Remove $REPO_DIR ($_sz, includes .env with VPN key)"
    if [ "$DRY_RUN" = "0" ]; then
        if safe_rm "$REPO_DIR"; then
            ok "Removed"
        else
            fail "Could not fully remove $REPO_DIR"
        fi
    fi
fi

# Try ~/.mmc — only if it ends up empty
if [ -d "$HOME/.mmc" ] && [ "$DRY_RUN" = "0" ]; then
    rmdir "$HOME/.mmc" 2>/dev/null && ok "Removed empty $HOME/.mmc" || true
fi

# --- Systemd unit ----------------------------------------------------------
if [ -f /etc/systemd/system/mmc.service ]; then
    section "systemd unit"
    plan "Disable+remove /etc/systemd/system/mmc.service"
    if [ "$DRY_RUN" = "0" ]; then
        sudo systemctl disable --now mmc.service 2>/dev/null || true
        sudo rm -f /etc/systemd/system/mmc.service
        sudo systemctl daemon-reload 2>/dev/null || true
        ok "mmc.service removed"
    fi
fi

# --- DATA_ROOT purge (opt-in, typed confirmation) --------------------------
if [ "$PURGE_DATA" = "1" ]; then
    section "Purge DATA_ROOT (--purge-data)"

    if is_mount "$DATA_ROOT"; then
        fail "DATA_ROOT is still a mount point ($DATA_ROOT) — refusing rm -rf."
        info "Unmount it manually and delete its contents on the NAS yourself."
    elif [ -d "$DATA_ROOT" ]; then
        _sz=$(size_of "$DATA_ROOT")
        plan "Remove $DATA_ROOT ($_sz)"
        if [ "$DRY_RUN" = "0" ]; then
            if confirm_delete "your media library" "$DATA_ROOT" "$_sz"; then
                if safe_rm "$DATA_ROOT"; then
                    ok "Removed"
                else
                    fail "Could not fully remove $DATA_ROOT"
                fi
            else
                warn "Cancelled — $DATA_ROOT left intact"
            fi
        fi
    else
        skip "$DATA_ROOT does not exist"
    fi
else
    if [ -d "$DATA_ROOT" ]; then
        _sz=$(size_of "$DATA_ROOT")
        skip "Skip $DATA_ROOT ($_sz). Use --purge-data to delete."
    fi
fi

# --- BACKUP_DIR purge (opt-in, typed confirmation) -------------------------
if [ "$PURGE_BACKUPS" = "1" ]; then
    section "Purge BACKUP_DIR (--purge-backups)"

    if is_mount "$BACKUP_DIR"; then
        fail "BACKUP_DIR is a mount point ($BACKUP_DIR) — refusing rm -rf."
    elif [ -d "$BACKUP_DIR" ]; then
        _sz=$(size_of "$BACKUP_DIR")
        plan "Remove $BACKUP_DIR ($_sz)"
        if [ "$DRY_RUN" = "0" ]; then
            if confirm_delete "your backups" "$BACKUP_DIR" "$_sz"; then
                if safe_rm "$BACKUP_DIR"; then
                    ok "Removed"
                else
                    fail "Could not fully remove $BACKUP_DIR"
                fi
            else
                warn "Cancelled — $BACKUP_DIR left intact"
            fi
        fi
    else
        skip "$BACKUP_DIR does not exist"
    fi
else
    if [ -d "$BACKUP_DIR" ]; then
        _sz=$(size_of "$BACKUP_DIR")
        skip "Skip $BACKUP_DIR ($_sz). Use --purge-backups to delete."
    fi
fi

# --- Remove Docker (opt-in) ------------------------------------------------
if [ "$REMOVE_DOCKER" = "1" ]; then
    section "Remove Docker engine (--remove-docker)"

    if [ "$FORCE" = "0" ] && detect_other_docker; then
        fail "Other Docker containers found on this host — refusing to remove Docker."
        info "Affected (non-MMC) artifacts:"
        docker ps -a --format '  - {{.Names}}  ({{.Image}}, {{.Status}})' 2>/dev/null \
            | grep -vE "^\s+- ($(echo "$MMC_CONTAINERS" | tr ' ' '|'))\b" || true
        info "Pass --force to remove Docker anyway (will break the above)."
    else
        plan "apt remove docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-ce-rootless-extras docker-buildx-plugin docker-model-plugin"
        plan "rm /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.asc"
        plan "gpasswd -d $USER docker"
        [ "$WIPE_DOCKER_DATA" = "1" ] && plan "rm -rf /var/lib/docker /var/lib/containerd"

        if [ "$DRY_RUN" = "0" ]; then
            sudo systemctl stop docker.socket docker.service containerd 2>/dev/null || true
            sudo systemctl disable docker.socket docker.service containerd 2>/dev/null || true
            sudo apt-get remove -y -qq \
                docker-ce docker-ce-cli containerd.io docker-compose-plugin \
                docker-ce-rootless-extras docker-buildx-plugin docker-model-plugin 2>&1 || true
            sudo apt-get autoremove -y -qq 2>&1 || true
            sudo rm -f /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.asc
            sudo gpasswd -d "$USER" docker 2>/dev/null || true
            if [ "$WIPE_DOCKER_DATA" = "1" ]; then
                sudo rm -rf /var/lib/docker /var/lib/containerd
                ok "Wiped /var/lib/docker and /var/lib/containerd"
            else
                warn "Left /var/lib/docker in place. Pass --wipe-docker-data to also delete it."
            fi
            ok "Docker removed"
        fi
    fi
fi

# --- Remove Node.js (opt-in) -----------------------------------------------
if [ "$REMOVE_NODE" = "1" ]; then
    section "Remove Node.js (--remove-node)"
    plan "apt remove nodejs"
    plan "rm /etc/apt/sources.list.d/nodesource.list /etc/apt/keyrings/nodesource.gpg"
    if [ "$DRY_RUN" = "0" ]; then
        sudo apt-get remove -y -qq nodejs 2>&1 || true
        sudo apt-get autoremove -y -qq 2>&1 || true
        sudo rm -f /etc/apt/sources.list.d/nodesource.list
        sudo rm -f /etc/apt/keyrings/nodesource.gpg
        ok "Node.js removed"
    fi
fi

# --- Remove NAS packages (opt-in) ------------------------------------------
if [ "$REMOVE_NAS_PACKAGES" = "1" ]; then
    section "Remove NAS packages (--remove-nas-packages)"

    # Don't yank packages another fstab entry still depends on
    _other_nfs=$(grep -E "^[^#].*[[:space:]]nfs[0-9]?[[:space:]]" /etc/fstab 2>/dev/null | wc -l | tr -d ' ')
    _other_cifs=$(grep -E "^[^#].*[[:space:]]cifs[[:space:]]" /etc/fstab 2>/dev/null | wc -l | tr -d ' ')

    if [ "$_other_nfs" = "0" ]; then
        plan "apt remove nfs-common"
        [ "$DRY_RUN" = "0" ] && sudo apt-get remove -y -qq nfs-common 2>&1 || true
    else
        skip "Keeping nfs-common ($_other_nfs other NFS entry in /etc/fstab)"
    fi

    if [ "$_other_cifs" = "0" ]; then
        plan "apt remove cifs-utils smbclient"
        [ "$DRY_RUN" = "0" ] && sudo apt-get remove -y -qq cifs-utils smbclient 2>&1 || true
    else
        skip "Keeping cifs-utils/smbclient ($_other_cifs other CIFS entry in /etc/fstab)"
    fi

    [ "$DRY_RUN" = "0" ] && sudo apt-get autoremove -y -qq 2>&1 || true
    info "Not removing rsync — too widely used by other tools."
fi

# --- Summary ---------------------------------------------------------------
section "Summary"

if [ "$DRY_RUN" = "1" ]; then
    info "${BOLD}Dry-run complete.${RESET} Nothing was changed."
    echo ""
    _flags="--yes"
    [ "$REMOVE_IMAGES" = "1" ]       && _flags="$_flags --remove-images"
    [ "$PURGE_DATA" = "1" ]          && _flags="$_flags --purge-data"
    [ "$PURGE_BACKUPS" = "1" ]       && _flags="$_flags --purge-backups"
    [ "$REMOVE_DOCKER" = "1" ]       && _flags="$_flags --remove-docker"
    [ "$WIPE_DOCKER_DATA" = "1" ]    && _flags="$_flags --wipe-docker-data"
    [ "$REMOVE_NODE" = "1" ]         && _flags="$_flags --remove-node"
    [ "$REMOVE_NAS_PACKAGES" = "1" ] && _flags="$_flags --remove-nas-packages"
    [ "$FORCE" = "1" ]               && _flags="$_flags --force"
    _hint_self="${_MMC_UNINSTALL_ORIG_SELF:-$0}"
    info "To apply the plan above:"
    info "  $_hint_self $_flags"
else
    printf "  ${GREEN}${BOLD}✓ Uninstall complete${RESET}\n"
    info "What remains intact (unless you passed the opt-in flags):"
    [ -d "$DATA_ROOT" ]   && info "  - $DATA_ROOT"
    [ -d "$BACKUP_DIR" ]  && info "  - $BACKUP_DIR"
    have_cmd docker       && info "  - Docker engine"
    have_cmd node         && info "  - Node.js"
fi

echo ""
exit 0
