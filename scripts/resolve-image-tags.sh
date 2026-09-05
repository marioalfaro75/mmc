#!/usr/bin/env bash
# Resolve the latest published tag for every IMAGE_* pin.
#
# The problem this solves: .env.example ships hardcoded pins that were current
# whenever someone last edited them. A fresh install inherits that snapshot, so
# "installed" and "already months behind on everything" were the same event —
# at one point Radarr, Prowlarr and SABnzbd were each a full major version back
# on a brand new install.
#
# Pinning itself is right: reproducible, no surprise 3am breakage. It's the
# *defaults* that shouldn't rot. So:
#
#   deploy.sh --install   calls this to write current pins into the new .env
#   a weekly CI job       calls this to open a PR bumping .env.example
#
# Either way you end up with an explicit pin you control; it just starts life
# current instead of stale.
#
# Usage:
#   ./scripts/resolve-image-tags.sh                  report against .env.example
#   ./scripts/resolve-image-tags.sh --write .env     rewrite IMAGE_* lines in .env
#   ./scripts/resolve-image-tags.sh --check          exit 1 if anything is behind
#
# Sources mirror APP_UPDATE_SOURCES in ui/src/lib/app-updates.ts. Keep them in
# step — if you add a service to one, add it to the other.

set -u

WRITE_FILE=""
CHECK_ONLY=0
QUIET=0

while [ $# -gt 0 ]; do
    case "$1" in
        --write) WRITE_FILE="${2:-}"; shift 2 ;;
        --check) CHECK_ONLY=1; shift ;;
        --quiet) QUIET=1; shift ;;
        -h|--help)
            sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done

say() { [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"; }

# VAR | kind | query-repo | tag-regex | image-prefix
#
# `kind` is hub or gh. The query repo differs from the image path for the
# LinuxServer images: they publish to Docker Hub as linuxserver/<x> but are
# pulled from the lscr.io mirror.
#
# IMAGE_MEDIA_UI is deliberately absent — it tracks this repo's own releases
# and .env.example pins it to :latest on purpose.
SOURCES='IMAGE_SONARR|hub|linuxserver/sonarr|^[0-9]+\.[0-9]+\.[0-9]+$|lscr.io/linuxserver/sonarr
IMAGE_RADARR|hub|linuxserver/radarr|^[0-9]+\.[0-9]+\.[0-9]+$|lscr.io/linuxserver/radarr
IMAGE_PROWLARR|hub|linuxserver/prowlarr|^[0-9]+\.[0-9]+\.[0-9]+$|lscr.io/linuxserver/prowlarr
IMAGE_QBITTORRENT|hub|linuxserver/qbittorrent|^[0-9]+\.[0-9]+\.[0-9]+$|lscr.io/linuxserver/qbittorrent
IMAGE_SABNZBD|hub|linuxserver/sabnzbd|^[0-9]+\.[0-9]+\.[0-9]+$|lscr.io/linuxserver/sabnzbd
IMAGE_BAZARR|hub|linuxserver/bazarr|^[0-9]+\.[0-9]+\.[0-9]+$|lscr.io/linuxserver/bazarr
IMAGE_GLUETUN|hub|qmcgaw/gluetun|^v[0-9]+\.[0-9]+(\.[0-9]+)?$|qmcgaw/gluetun
IMAGE_UNPACKERR|hub|golift/unpackerr|^[0-9]+\.[0-9]+\.[0-9]+$|golift/unpackerr
IMAGE_WATCHTOWER|hub|containrrr/watchtower|^[0-9]+\.[0-9]+\.[0-9]+$|containrrr/watchtower
IMAGE_RECYCLARR|gh|recyclarr/recyclarr|^[0-9]+\.[0-9]+\.[0-9]+$|ghcr.io/recyclarr/recyclarr
IMAGE_SEERR|gh|seerr-team/seerr|^v?[0-9]+\.[0-9]+\.[0-9]+$|ghcr.io/seerr-team/seerr
IMAGE_FLARESOLVERR|gh|FlareSolverr/FlareSolverr|^v[0-9]+\.[0-9]+\.[0-9]+$|ghcr.io/flaresolverr/flaresolverr'

# Extract tag names from a registry response. Mirrors the python3 → node
# cascade already used by is_json() rather than adding jq as a dependency.
json_pluck() {
    if command -v python3 >/dev/null 2>&1; then
        if [ "$1" = "hub" ]; then
            python3 -c 'import json,sys
try:
    for x in json.load(sys.stdin).get("results") or []: print(x["name"])
except Exception: pass'
        else
            python3 -c 'import json,sys
try:
    for r in json.load(sys.stdin):
        if not r.get("prerelease") and not r.get("draft"): print(r["tag_name"])
except Exception: pass'
        fi
    elif command -v node >/dev/null 2>&1; then
        if [ "$1" = "hub" ]; then
            node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{(JSON.parse(s).results||[]).forEach(x=>console.log(x.name))}catch(e){}})'
        else
            node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).forEach(r=>{if(!r.prerelease&&!r.draft)console.log(r.tag_name)})}catch(e){}})'
        fi
    else
        return 1
    fi
}

# Highest tag matching the pattern, or empty. `sort -V` understands both
# 1.41.4 > 1.5.0 and a leading v, which a lexical sort gets wrong.
latest_tag() {
    _kind="$1"; _repo="$2"; _re="$3"
    if [ "$_kind" = "hub" ]; then
        _url="https://hub.docker.com/v2/repositories/${_repo}/tags?page_size=100&ordering=last_updated"
    else
        _url="https://api.github.com/repos/${_repo}/releases?per_page=30"
    fi
    curl -fsSL -m 20 -H 'User-Agent: mmc-resolve-image-tags' "$_url" 2>/dev/null \
        | json_pluck "$_kind" \
        | grep -E "$_re" \
        | sort -V \
        | tail -1
}

# Currently pinned tag for VAR in FILE, or empty.
current_pin() {
    [ -f "$2" ] || return 0
    grep -E "^${1}=" "$2" 2>/dev/null | head -1 | sed -e 's/^[^=]*=//' -e 's/.*://'
}

TARGET="${WRITE_FILE:-.env.example}"
if [ ! -f "$TARGET" ]; then
    echo "No such file: $TARGET" >&2
    exit 2
fi

STALE=0
UNRESOLVED=0

# One pass. Resolving is a network round-trip per image, so don't do it twice
# just to produce a verdict.
while IFS='|' read -r var kind repo re prefix; do
    [ -z "${var:-}" ] && continue

    tag="$(latest_tag "$kind" "$repo" "$re")"
    if [ -z "$tag" ]; then
        say "  ? ${var}: could not resolve from ${repo}"
        UNRESOLVED=$((UNRESOLVED + 1))
        continue
    fi

    cur="$(current_pin "$var" "$TARGET")"
    if [ "$cur" = "$tag" ]; then
        say "  = ${var}: ${tag}"
    else
        say "  ^ ${var}: ${cur:-unset} -> ${tag}"
        STALE=$((STALE + 1))
        if [ -n "$WRITE_FILE" ]; then
            # `|` delimiter: image refs contain / and : but never |
            sed -i "s|^${var}=.*|${var}=${prefix}:${tag}|" "$WRITE_FILE"
        fi
    fi
done <<EOF
$SOURCES
EOF

say ""
if [ "$UNRESOLVED" -gt 0 ]; then
    say "${UNRESOLVED} image(s) could not be resolved — network, rate limit, or a renamed repo."
    say "Existing pins were left alone; nothing is worse off than before."
fi

if [ -n "$WRITE_FILE" ]; then
    if [ "$STALE" -gt 0 ]; then
        say "Updated ${STALE} pin(s) in ${WRITE_FILE}."
    else
        say "All pins in ${WRITE_FILE} were already current."
    fi
fi

# Unresolved is not stale: we don't know, and guessing would be worse than
# saying so. Only a confirmed behind-ness fails --check.
if [ "$CHECK_ONLY" -eq 1 ] && [ "$STALE" -gt 0 ]; then
    exit 1
fi
exit 0
