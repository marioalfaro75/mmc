# Mars Media Centre

A fully automated, containerized media centre stack using Docker Compose. Manages the complete lifecycle: requesting media, finding sources, downloading via VPN-protected clients, organising libraries, and streaming through Plex.

All 11 services are pre-configured to work together with hardlink support, VPN kill-switch protection for download clients, and a unified web dashboard. Plex runs as an external server — set `PLEX_URL` in Settings to add a sidebar link.

## Architecture

```
User → Seerr → Sonarr/Radarr → Prowlarr → Indexers
                    │
              qBittorrent/SABnzbd ←→ Gluetun VPN
                    │
              Unpackerr (extract)
                    │
              Sonarr/Radarr (import/rename)
                    │
              Plex (stream) ← Bazarr (subtitles)
```

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A VPN account (ProtonVPN, Mullvad, AirVPN, etc.)
- An existing Plex Media Server (the stack connects to it externally)
- A usenet provider (optional, for SABnzbd)
- Linux host with sufficient storage for media

## Quick Start

### One-Liner Install (WSL / Linux)

Run this single command on a fresh WSL or Linux system — it installs Docker, Node.js, clones the repo, and deploys everything:

```bash
curl -fsSL https://raw.githubusercontent.com/marioalfaro75/mmc/main/scripts/deploy.sh | bash -s -- --install
```

The installer will:
1. Detect WSL and show persistence tips
2. Install Docker Engine, Node.js 20, and git (skips anything already installed)
3. Clone the repository into an `mmc` folder in the current directory
4. Launch the interactive setup wizard and staged deploy

> **Re-running on an existing install** automatically switches to `--update` mode (pulls latest code, migrates `.env`, graceful restart — no data loss).

> **WSL users:** To keep containers running after closing the terminal, add this to `C:\Users\<you>\.wslconfig`:
> ```ini
> [wsl2]
> vmIdleTimeout=-1
> ```

### Manual Install

If you prefer to install prerequisites yourself:

```bash
# 1. Clone the repository
git clone https://github.com/marioalfaro75/mmc.git && cd mmc

# 2. Run the deploy wizard (creates .env, initialises directories, starts services)
./scripts/deploy.sh
```

The interactive wizard will prompt for VPN credentials, storage paths, and preferences, then run a staged deploy with health checks.

### Storage Paths

By default, data is stored outside the repo under `~/.mmc/`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATA_ROOT` | `~/.mmc/data` | Media files, downloads, watch folders |
| `CONFIG_ROOT` | `~/.mmc/config` | Container configuration volumes |
| `BACKUP_DIR` | `~/.mmc/backups` | Backup archives |

The wizard prompts for these during first run. You can also change them later via the web UI Settings page or by editing `.env` directly.

#### NAS Storage

To store media on a NAS or network share, use the **Migration** page in the web UI (recommended) or, for legacy fresh-install setups, the deploy wizard.

The Migration page offers two NAS modes:

- **Managed Volume (recommended)** — Docker mounts the share directly via a named volume with the CIFS/NFS driver. No host mount, no `sudo`, no fstab edits, and no WSL2 shadow-mount headaches. One click writes the override file, recreates services, and the volume is live. Works identically on Linux, macOS, and WSL2.
- **Host Mount Script (legacy)** — Generates a bash script you run with `sudo` to mount the share via fstab. Kept as a fallback; prefer the managed volume on WSL2.

Either way, the internal container path is `/mnt/nas/media`, so existing Sonarr/Radarr root folders keep working unchanged. The managed-volume mode writes a gitignored `docker-compose.nas.override.yml` and stores credentials in `.env` (`NAS_HOST`, `NAS_SHARE`, `NAS_USERNAME`, `NAS_PASSWORD`, `NAS_VERS`). The deploy script's `--nas` flag is still available for fresh installs.

See the [Migration page](#media-migration) section below for details on moving an existing library to a NAS.

## Deploy Script

```bash
./scripts/deploy.sh              # Interactive wizard (first run) or quick deploy
./scripts/deploy.sh --install    # Full bootstrap: install prerequisites, clone, deploy
./scripts/deploy.sh --update     # Pull latest code, migrate .env, rebuild all
./scripts/deploy.sh --dry-run    # Pre-flight validation only (no containers)
./scripts/deploy.sh --nas        # Set up a NAS mount for media storage
./scripts/deploy.sh --skip-ui    # Skip npm install/build steps
./scripts/deploy.sh --help       # Show all options
```

### First Deploy

On first run (no `.env` file), the wizard walks through:

1. VPN provider and credentials
2. Storage paths (`DATA_ROOT`, `CONFIG_ROOT`, `BACKUP_DIR`)
3. User/group IDs

Then runs a staged deploy: VPN first (with healthcheck), then download clients, arr stack, media companions, operations, and finally the web UI.

### Subsequent Deploys

When containers already exist, `deploy.sh` runs `docker compose up -d --build` to pick up any code or config changes, including rebuilding the web UI.

## Updating

### Update Script

The recommended way to update to the latest version:

```bash
./scripts/deploy.sh --update
```

This does three things:
1. `git pull` — fetches the latest code
2. `.env` migration — adds any new variables from `.env.example` (never overwrites existing values)
3. `docker compose up -d --build` — rebuilds and restarts all containers

### Automatic Image Updates (Watchtower)

Watchtower checks for updated Docker images daily at 4 AM (configurable via `WATCHTOWER_SCHEDULE`). Only containers with `com.centurylinklabs.watchtower.enable=true` are updated. The custom UI is excluded.

### Pinning Versions

All Docker images are pinned to specific versions by default in `.env.example`. To update manually:

```bash
docker compose pull    # Pull latest images
docker compose up -d   # Recreate changed containers
```

## Post-Deploy Configuration

Complete these steps in order after first deploy. The web UI also has a full interactive guide with Quick Setup buttons at `http://localhost:3000/guide`.

### Auto-Detect API Keys

After first deploy, go to the Guide page and click **Detect API Keys**. This reads API keys from Sonarr, Radarr, Prowlarr, Seerr, and Bazarr config files and saves them to Settings automatically. Also populates Unpackerr keys.

### Phase 1: VPN & Download Clients

1. **Verify VPN**:
   ```bash
   docker exec gluetun wget -qO- https://ipinfo.io
   ```
   Confirm the output shows a VPN IP, not your real IP. If it fails, check `docker logs gluetun` for connection errors.

2. **qBittorrent** (`localhost:8080`):
   - Default login: username `admin` — find the temporary password in container logs:
     ```bash
     docker logs qbittorrent 2>&1 | grep "temporary password"
     ```
   - **Change the default password** immediately: Options → Web UI → Authentication
   - Use Quick Setup in the Guide page to auto-configure save paths, categories, VPN binding, and seeding limits

3. **SABnzbd** (`localhost:8081`):
   - Run through the setup wizard on first access
   - Add your usenet server(s): Config → Servers → Add Server
   - Set folders: Config → Folders:
     - Completed Download Folder: `/data/usenet`
     - Incomplete Download Folder: `/data/usenet/incomplete`
   - Add categories: Config → Categories:
     - `movies` → Folder/Path: `/data/usenet/movies`
     - `tv` → Folder/Path: `/data/usenet/tv`

### Phase 2: Indexers & Media Managers

4. **Prowlarr** (`localhost:9696`):
   - Add indexers: Indexers → Add Indexer → search and configure your trackers/usenet indexers
   - Use Quick Setup to auto-connect Sonarr and Radarr, or manually add via Settings → Apps

5. **Sonarr** (`localhost:8989`):
   - Use Quick Setup to auto-configure root folder, download clients, and naming, or configure manually
   - Find your API key: Settings → General → API Key

6. **Radarr** (`localhost:7878`):
   - Use Quick Setup to auto-configure root folder, download clients, and naming, or configure manually
   - Find your API key: Settings → General → API Key

7. **Unpackerr**:
   - If you ran Detect API Keys, Unpackerr keys are already set. Otherwise, set `UN_SONARR_0_API_KEY` and `UN_RADARR_0_API_KEY` in Settings.

8. **TMDB (optional)** — enables searching for movies and TV shows by actor name:
   - Create a free account at [themoviedb.org/signup](https://www.themoviedb.org/signup)
   - Go to [Settings → API](https://www.themoviedb.org/settings/api) and create a Developer API key
   - Add the API key via the Guide page Quick Setup, or in Settings → Services → `TMDB API Key`
   - The "Actor" search option will then appear in the Add Movie/Series dialogs

### Phase 3: Subtitles & Requests

8. **Bazarr** (`localhost:6767`):
   - Use Quick Setup in the Guide page to auto-connect Sonarr and Radarr, or configure manually
   - Add subtitle providers: Settings → Providers → Add (OpenSubtitles, Addic7ed, etc.)
   - Set languages: Settings → Languages → add your preferred subtitle language(s)

9. **Seerr** (`localhost:5055`):
   - Sign in with your Plex account on first access (creates admin user)
   - Use Quick Setup in the Guide page or the "Auto-configure Seerr" button on the Requests page to connect Sonarr and Radarr automatically
   - Configure user permissions: Settings → Users → click a user → set request limits and auto-approve rules

### Phase 4: Operations

10. **Recyclarr**:
    - Use Quick Setup in the Guide page to auto-configure with TRaSH Guide 1080p profiles, or configure manually
    - Reference [TRaSH-Guides](https://trash-guides.info/) for recommended custom formats and quality profiles
    - Run a manual sync: `docker exec recyclarr recyclarr sync`

11. **Watchtower**: Verify running — `docker logs watchtower`. Auto-updates enabled containers daily at 4 AM.

12. **Plex**: Set `PLEX_URL` in Settings → Services to add a sidebar link to your Plex server.

13. **Backup**: Test with `./scripts/backup.sh` — verify the archive is created in your `BACKUP_DIR`

## Service URLs

| Service | Default URL | Purpose |
|---------|-------------|---------|
| Mars Media Centre UI | `http://localhost:3000` | Dashboard & management |
| qBittorrent | `http://localhost:8080` | Torrent client |
| SABnzbd | `http://localhost:8081` | Usenet client |
| Sonarr | `http://localhost:8989` | TV show management |
| Radarr | `http://localhost:7878` | Movie management |
| Prowlarr | `http://localhost:9696` | Indexer management |
| Seerr | `http://localhost:5055` | Media requests |
| Bazarr | `http://localhost:6767` | Subtitle management |
| Gluetun | `http://localhost:8000` | VPN control API |

> All ports are bound to `127.0.0.1` (localhost only) by default. Plex runs externally and is accessed via the sidebar link.

## Security

The stack includes security hardening out of the box:

- **All ports localhost-only** — services are not exposed to the network (except torrent port 6881)
- **Admin authentication** — create admin accounts via Settings → Admins or the first-time setup page. Admin-only pages (TV Shows, Movies, Settings, System, etc.) require login. Public pages (Dashboard, Downloads, Calendar, Requests) are accessible to anyone. Non-admins cannot pause/resume downloads or auto-configure Seerr. Sessions are persisted to `${CONFIG_ROOT}/admin-sessions.json` so you stay logged in across container restarts.
- **Defence-in-depth** — admin-only API routes are protected by both middleware and per-handler session validation (`requireAdmin`), so a middleware bypass cannot expose admin endpoints
- **Optional site-wide lock** — set `MMC_API_KEY` in `.env` to require an API key for all access (applied before admin auth)
- **VPN control auth** — Gluetun control API uses basic auth (`GLUETUN_CONTROL_PASSWORD`)
- **Security headers** — CSP, X-Frame-Options, rate limiting (120 req/min), CSRF protection
- **Docker images pinned** — specific version tags, not `:latest`
- **Secrets redacted** — deploy logs automatically redact VPN keys

## VPN Configuration

Gluetun supports 60+ VPN providers. Below are common examples. For the full list, see the [Gluetun provider list](https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers).

> **WireGuard vs OpenVPN:** WireGuard is faster and uses less CPU. OpenVPN has broader provider support. Use WireGuard when your provider offers it.

> **WireGuard MTU:** `WIREGUARD_MTU` defaults to 1280 for maximum compatibility, especially on WSL2 where the Hyper-V NAT adds encapsulation overhead. If you experience VPN connectivity issues (DNS timeouts, healthcheck failures), this default should resolve them. You can adjust the value in Settings → VPN or in `.env`.

### ProtonVPN (WireGuard)

```env
VPN_SERVICE_PROVIDER=protonvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Netherlands
```

Generate WireGuard credentials at [account.protonvpn.com](https://account.protonvpn.com) → WireGuard configuration.

#### ProtonVPN Secure Core

Secure Core routes traffic through a privacy-friendly entry country (Iceland, Switzerland, or Sweden) before exiting in the target country. Configure in the web UI under Settings → VPN (appears when ProtonVPN is selected), or set in `.env`:

```env
SECURE_CORE_ONLY=on
SERVER_HOSTNAMES=is-au-01.protonvpn.com
SERVER_COUNTRIES=
```

The hostname format is `{entry}-{exit}-XX.protonvpn.com` (e.g. `is-au-01.protonvpn.com` for Iceland → Australia, `ch-us-01a.protonvpn.com` for Switzerland → US). Requires a paid ProtonVPN plan (Plus or Visionary). `SERVER_COUNTRIES` must be cleared when using Secure Core.

### Mullvad

```env
VPN_SERVICE_PROVIDER=mullvad
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Switzerland
```

### NordVPN

```env
VPN_SERVICE_PROVIDER=nordvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
SERVER_COUNTRIES=Netherlands
```

### Other Providers

AirVPN, Surfshark, PIA, Windscribe, and 50+ more are supported. See the [Gluetun wiki](https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers) for provider-specific configuration.

## VPN Kill-Switch Protection

qBittorrent and SABnzbd are configured with `network_mode: service:gluetun` in Docker Compose. This means they share Gluetun's network stack entirely — they have no independent network interface and all traffic must traverse the VPN tunnel.

- **No independent networking** — download clients have no direct access to your host network
- **Startup dependency** — download clients will not start until Gluetun's healthcheck confirms the VPN is connected
- **Automatic kill-switch** — if the VPN drops, download clients lose all connectivity immediately with no fallback path
- **No exposed ports** — download client containers have no ports of their own; their web UIs are published on the Gluetun container

This is the most secure configuration possible with Docker — there is no bypass route even if the VPN tunnel interface goes down.

## Verifying VPN Works

```bash
# Check Gluetun's VPN IP (should NOT be your real IP)
docker exec gluetun wget -qO- https://ipinfo.io

# Verify qBittorrent is also behind VPN
docker exec qbittorrent wget -qO- https://ipinfo.io

# Both should show the same VPN IP address
```

## Web UI

The Mars Media Centre dashboard at `http://localhost:3000` provides:

- Combined download queue (torrents + usenet) with pause, resume, force start, and delete with optional file removal. Sort by name or progress. Import-blocked downloads shown with warning messages and blocklist/search actions.
- Dashboard with download stats (today/week/failed counts + recently completed history)
- Merged calendar (TV episodes + movies) with correct series name resolution
- Library browsing with search by title, year, or actor name (TMDB), add, delete, and automatic missing content detection
- TV show episode browser with per-series missing episode search, season-level monitor toggles, "Monitor All & Search" shortcut, and live download indicators
- Media request management with search, request, approve/decline, and delete
- Media migration wizard: move media to a NAS/network share or local directory with filesystem browser and rsync progress tracking
- Network page with live VPN topology, tunnel bandwidth monitoring, and per-service traffic stats
- System page with unified service monitoring (Docker state, API health), granular VPN status (connected/connecting/error/disconnected) with IP and country display, per-service start/stop/restart, and log viewer with copy-to-clipboard
- Settings with API key management, auto-detection, configuration, qBittorrent download preferences, scheduled backups, and backup management
- Global service status bar showing offline services with recovery notifications
- Plex sidebar link for quick access to your media server
- Automatic missing content search every 6 hours (Sonarr + Radarr)

### Settings Page

The Settings page (`http://localhost:3000/settings`) provides tabbed configuration:

- **General** — Timezone, user/group IDs, storage paths, log level, API key (authentication)
- **VPN** — Provider, credentials, server country, port forwarding, ProtonVPN Secure Core
- **Network** — Docker/local subnets, all service ports
- **Downloads** — qBittorrent queue limits, speed limits, and seeding limits
- **Quality** — Toggle upgrade downloads per Sonarr/Radarr quality profile, bulk assign profiles to all movies or series
- **Services** — API keys for all services (with auto-detect and direct links to each service's UI), TMDB API key (actor search), Plex URL, Watchtower schedule, Docker image tags
- **Backups** — Create, download, restore, and delete configuration backups. Scheduled automatic backups (daily/weekly) with configurable retention.
- **Admins** — Create, edit, and delete admin user accounts for the web UI

### Logs Page

The Logs page (`http://localhost:3000/logs`) provides two tabs:

- **Services** — View application log files for each service (Sonarr, Radarr, Prowlarr, Bazarr, Seerr, Recyclarr, media-ui). Toggle between app logs and Docker container output.
- **Deploy** — Browse and view deploy script log files

## Media Migration

The Migration page (`http://localhost:3000/migration`) lets you move your media library to a NAS, network share, or local directory without leaving the web UI.

### Destination Options

- **NAS / Network Share** — SMB or NFS share on your network (e.g. Synology, TrueNAS). Two setup modes: **Managed Volume** (recommended; Docker mounts the share per-container) or **Host Mount Script** (legacy; bash script you run with sudo).
- **Local Directory** — Another drive or path on this machine (e.g. `/mnt/d`, a second SSD, external USB). Includes a filesystem browser.

### How It Works

The media stack uses a specific folder structure under `DATA_ROOT`:

```
DATA_ROOT/
  media/
    movies/    ← Radarr puts completed movies here
    tv/        ← Sonarr puts completed TV shows here
  torrents/
    movies/    ← qBittorrent downloads movies here
    tv/        ← qBittorrent downloads TV here
  usenet/
    movies/    ← SABnzbd downloads movies here
    tv/        ← SABnzbd downloads TV here
```

Migration copies only the `media/` folder (completed movies and TV shows) to the new location. The `torrents/` and `usenet/` directories are not moved — download clients continue using the original paths. Sonarr and Radarr automatically route future completed downloads to the correct folder (`media/movies` or `media/tv`).

> **Note:** Only media tracked by Sonarr and Radarr is displayed after migration. If the destination already contains media not managed by Sonarr/Radarr, add it manually through the Movies or TV pages.

### Migration Steps

1. **Choose Destination** — Select NAS or local directory.
2. **Setup** — For NAS managed volume: enter connection details and click *Configure NAS Volume*. For NAS script mode: enter connection details, generate the mount script, run it with sudo, verify the mount. For local: browse or type the path and verify it's writable.
3. **Pre-flight Checks** — Validates Sonarr/Radarr/Bazarr connectivity, active downloads, and available disk space. Bazarr is checked with retries to ride out its slow startup after a recreate.
4. **Migrate** — Copies existing media via rsync with progress tracking, **verifies via checksum** (not just mtimes), updates Sonarr/Radarr root folders, optionally updates `DATA_ROOT` in `.env`, then deletes the source files **last** for safety. If anything fails, the source stays intact.

### CLI Alternative

```bash
./scripts/deploy.sh --nas    # Interactive NAS setup (legacy host-mount mode)
```

For new setups, prefer the Migration page Managed Volume mode — it avoids the host-mount and works on WSL2 without the docker-desktop shadow-mount issue.

## Backup & Restore

Backups protect your service configurations — databases, settings, API keys, quality profiles, and indexer configs for every service. Media files (movies, TV shows, downloads), the `.env` file, and Docker images are **not** included in backups.

### Web UI

The easiest way to manage backups is via the Settings page:

- **Settings → Backups → Back Up Now** — create a new backup
- **Download** — save a copy to your local machine
- **Restore** — stops services, overwrites configs, restarts everything
- **Delete** — remove old backups

### CLI Backup

```bash
./scripts/backup.sh
# Creates: ~/.mmc/backups/mars-media-centre-backup-YYYY-MM-DD-HHMMSS.tar.gz
# Automatically keeps last 7 backups
```

### Scheduled Backups

Enable automatic backups from the web UI: **Settings → Backups → Scheduled Backups**. Configure frequency (daily/weekly), time, and how many backups to keep. The scheduler runs inside the media-ui container — no host cron job needed.

Alternatively, use a cron job on the host:

```bash
crontab -e
0 3 * * * /path/to/mmc/scripts/backup.sh >> /var/log/mars-media-centre-backup.log 2>&1
```

### CLI Restore

```bash
./scripts/restore.sh ~/.mmc/backups/mars-media-centre-backup-2024-01-15-030000.tar.gz
# Stops containers, restores configs, sets permissions
# Then run: docker compose up -d
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| VPN won't connect | Check `WIREGUARD_PRIVATE_KEY` and `SERVER_COUNTRIES` in `.env`. Try a different country. Check `docker logs gluetun`. |
| qBittorrent unreachable | Ports are on the Gluetun container. Check `docker logs gluetun` and ensure healthcheck passes. |
| Downloads stuck | Verify `FIREWALL_OUTBOUND_SUBNETS` includes `${DOCKER_SUBNET}`. Check VPN port forwarding. |
| Sonarr/Radarr can't connect to download client | Use `gluetun` as hostname (not `localhost`). qBittorrent: `gluetun:8080`, SABnzbd: `gluetun:8081`. |
| Hardlinks not working | All paths must be on the same filesystem/volume. Verify `DATA_ROOT` is a single mount point. |
| Permission errors | Verify `PUID`/`PGID` match your host user (`id` command). Re-run `sudo ./scripts/init.sh`. |
| Container keeps restarting | Check logs: `docker logs <container-name>`. Common cause: missing or invalid config. |
| Web UI shows login page | `MMC_API_KEY` is set in `.env`. Clear it to disable auth, or enter the key to log in. |

## Managing Containers

### All Services

```bash
docker compose up -d       # Start all services
docker compose down        # Stop and remove all containers (preserves data and configs)
docker compose restart     # Restart all services
```

### Individual Containers

```bash
docker stop sonarr         # Stop a container
docker start sonarr        # Start a stopped container
docker restart sonarr      # Restart a container
docker rm -f sonarr        # Force stop and remove a container
docker logs -f sonarr      # Follow a container's logs
```

Replace `sonarr` with any container name: `gluetun`, `qbittorrent`, `sabnzbd`, `prowlarr`, `sonarr`, `radarr`, `unpackerr`, `bazarr`, `seerr`, `recyclarr`, `watchtower`, `media-ui`.

### Rebuilding After Removal

If you remove a container and want to bring it back:

```bash
docker compose up -d sonarr           # Recreate a single service
docker compose up -d --build media-ui # Rebuild and start the UI
```

## Uninstalling

```bash
# 1. Stop and remove containers, networks
docker compose down

# 2. Remove container configs (DESTRUCTIVE)
rm -rf ~/.mmc/config

# 3. Remove media data (DESTRUCTIVE — your media library!)
# rm -rf ~/.mmc/data

# 4. Remove Docker images
docker compose down --rmi all
```
