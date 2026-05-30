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

### One-Liner Install (Ubuntu)

Run this single command on a fresh Ubuntu host — it installs Docker, Node.js, clones the repo, and deploys everything:

```bash
curl -fsSL https://raw.githubusercontent.com/marioalfaro75/mmc/main/scripts/deploy.sh | bash -s -- --install
```

The installer will:
1. Refuse to run on anything that isn't a real Linux host (no WSL, no macOS)
2. Install Docker Engine, Node.js 20, and git (skips anything already installed)
3. Clone the repository into an `mmc` folder in the current directory
4. Launch the interactive setup wizard and staged deploy

> **Re-running on an existing install** automatically switches to `--update` mode (pulls latest code, migrates `.env`, graceful restart — no data loss).

### Running on a dedicated Ubuntu VM

This is the recommended deployment target. A few tips for a clean setup:

1. **Pin a static IP.** Without one, the VM's address can change after a DHCP lease renewal and break your bookmarks. The simplest path is a DHCP reservation on the router (bind the VM's MAC to a fixed IP). For belt-and-braces, also give the VM a static address via netplan, e.g. `/etc/netplan/01-mmc.yaml`:
   ```yaml
   network:
     version: 2
     ethernets:
       eth0:
         dhcp4: no
         addresses: [192.168.1.50/24]
         routes:
           - to: default
             via: 192.168.1.1
         nameservers:
           addresses: [1.1.1.1, 9.9.9.9]
   ```
   Then `sudo netplan apply`.

2. **Bind services to the LAN.** Set `HOST_BIND=0.0.0.0` (or the static IP) in `.env` — see [Exposing services on the LAN](#exposing-services-on-the-lan) above.

3. **Start on boot.** Install the systemd unit so the stack comes back after a reboot:
   ```bash
   ./scripts/install-systemd-service.sh
   sudo systemctl start mmc       # or just reboot
   ```
   The installer templates the unit with the project path and your username, enables it, and prints status commands.

4. **NAS shares.** Use the Migration page's *Managed Volume* mode (no `sudo`, no fstab). If you prefer host mounts, the generated script uses `_netdev,nofail` fstab entries that systemd turns into proper network-dependent mount units on Ubuntu — no further wiring needed.

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

- **Managed Volume (recommended)** — Docker mounts the share directly via a named volume with the CIFS/NFS driver. No host mount, no `sudo`, no fstab edits. One click writes the override file, recreates services, and the volume is live.
- **Host Mount Script (legacy)** — Generates a bash script you run with `sudo` to mount the share via fstab. The generated entries use `_netdev,nofail` so systemd handles them as network-dependent mount units on Ubuntu. Kept as a fallback; prefer the managed volume.

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

### Exposing services on the LAN

On a dedicated Ubuntu VM you'll usually want other devices on the network to reach the UIs. Set `HOST_BIND` in `.env`:

```env
HOST_BIND=0.0.0.0           # bind to every interface
# or
HOST_BIND=192.168.1.50      # bind to one LAN IP only
```

Then restart: `docker compose up -d`. Pair this with `ufw` so only your LAN can reach the ports — for example:

```bash
sudo ufw default deny incoming
sudo ufw allow from 192.168.1.0/24 to any port 3000   # media-ui
sudo ufw allow from 192.168.1.0/24 to any port 5055   # seerr (optional)
sudo ufw allow 6881                                   # torrent peer port
sudo ufw enable
```

Note: torrent port 6881 must accept connections from the public internet, so don't lock it down to your LAN.

## Security

The stack includes security hardening out of the box:

- **All ports localhost-only** by default — services are not exposed to the network (except torrent port 6881). Set `HOST_BIND=0.0.0.0` in `.env` to expose to the LAN, pair with `ufw`.
- **Admin authentication** — create admin accounts via Settings → Admins or the first-time setup page. Admin-only pages (TV Shows, Movies, Settings, System, etc.) require login. Public pages (Dashboard, Downloads, Calendar, Requests) are accessible to anyone. Sessions are persisted to `${CONFIG_ROOT}/admin-sessions.json` (mode 0600) so you stay logged in across container restarts.
- **Defence-in-depth** — admin-only API routes are protected by both middleware and per-handler session validation (`requireAdmin`), so a middleware bypass cannot expose admin endpoints
- **Optional site-wide lock** — set `MMC_API_KEY` in `.env` to require an API key for all access. The key is checked with constant-time byte comparison so timing attacks can't leak it.
- **HTTPS-aware** — set `HTTPS_ONLY=1` in `.env` when the UI is fronted by TLS (reverse proxy or direct cert). Adds the `Secure` flag to auth cookies and emits HSTS.
- **VPN control auth** — Gluetun control API uses basic auth (`GLUETUN_CONTROL_PASSWORD`)
- **Security headers** — strict CSP (no `unsafe-eval` in production; `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Frame-Options: DENY`, rate limiting (120 req/min), same-origin CSRF check on mutating requests.
- **Secrets at rest** — `.env`, `admins.json`, and backup archives are written with mode 0600. `init.sh` re-applies 0600 to `.env` on every run so legacy installs get auto-fixed.
- **Backup integrity** — `restore.sh` inspects archive members for absolute paths and `../` before extracting (tar-slip guard); extraction uses `--no-same-owner --no-absolute-names`.
- **Log redaction** — deploy logs redact 14 secret variables (VPN keys, NAS password, MMC_API_KEY, every service API key).
- **Docker images pinned** — specific version tags, not `:latest`
- **CI dependency audit** — `npm audit --audit-level=critical` blocks PRs that introduce a critical CVE; high-level advisories are reported but not blocking (Next.js 14 has unfixed highs that need a major upgrade to address).

## VPN Configuration

Gluetun supports 60+ VPN providers. Below are common examples. For the full list, see the [Gluetun provider list](https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers).

> **WireGuard vs OpenVPN:** WireGuard is faster and uses less CPU. OpenVPN has broader provider support. Use WireGuard when your provider offers it.

> **WireGuard MTU:** `WIREGUARD_MTU` defaults to 1420 — the standard value and the best throughput on a regular LAN. If you see VPN connectivity issues (DNS timeouts, healthcheck failures) on a double-NAT link or certain mobile carriers, lower it to 1280 in Settings → VPN or in `.env`.

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
- **Local Directory** — Another drive or path on this machine (e.g. `/srv/media`, a second SSD, external USB mounted under `/mnt`). Includes a filesystem browser.

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

For new setups, prefer the Migration page Managed Volume mode — it avoids the host-mount step and the fstab edit entirely.

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

## Tests

Static checks run on every push and PR via `.github/workflows/ci.yml`:

| Check | Command | What it catches |
|-------|---------|-----------------|
| Shell syntax | `bash -n scripts/*.sh` | Typos in deploy/init/backup scripts |
| Compose render | `docker compose config -q` | Bad YAML or unresolved `${VAR}` references |
| TypeScript | `cd ui && npx tsc --noEmit` | Type errors in the UI |
| Unit tests | `cd ui && npm test` | Schema integrity, shell-escape safety, mount-script input validation |
| systemd unit | `systemd-analyze verify scripts/mmc.service` | Malformed boot unit |

Run the UI tests locally with `cd ui && npm test` (or `npm run test:watch`). The test suite lives in `ui/src/**/*.test.ts`.

These are static + unit checks only. Full end-to-end testing (VPN kill-switch, NAS mounts, boot survival) needs to run against a real Ubuntu VM — see the deploy guide above.

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

Mars Media Centre ships with `scripts/uninstall.sh` — a surgical, opt-in teardown tool that removes everything the installer adds without touching anything else on the host. It's safe to run on a multi-purpose VM that also has unrelated Docker containers, Node projects, or NFS/CIFS mounts.

### TL;DR

```bash
cd ~/mmc

# 1. Preview what would be removed (NOTHING is changed)
./scripts/uninstall.sh

# 2. Apply the plan you just previewed
./scripts/uninstall.sh --yes
```

The default invocation is always a dry-run. Pass `--yes` (with the same flags) to actually do it.

### How it works

The script has three concentric layers. **Tier 1** is unconditional — it removes only stuff that's unambiguously MMC's. The deeper tiers are opt-in flags you add as needed.

#### Tier 1 (always runs with `--yes`)

| Step | What's removed |
|---|---|
| Containers | The 12 MMC containers: `gluetun`, `qbittorrent`, `sabnzbd`, `prowlarr`, `sonarr`, `radarr`, `unpackerr`, `bazarr`, `seerr`, `recyclarr`, `watchtower`, `media-ui` |
| Networks | `mmc_medianet`, `mmc_default` (created by Compose) |
| Locally-built image | `mmc-media-ui:latest` (the Next.js dashboard image; nothing else can use it) |
| Config | `~/.mmc/config/` (Sonarr, Radarr, etc. settings databases) |
| Logs | `~/.mmc/logs/` (deploy logs) |
| Markers | `~/.mmc/install-path`, `~/.mmc/.nas-credentials` (SMB) |
| Repo | `~/mmc/` (cloned source tree, **including `.env` with your WireGuard private key**) |
| systemd unit | `/etc/systemd/system/mmc.service` if installed |
| NAS mount | `umount` and remove the exact `/etc/fstab` line if `DATA_ROOT` is a network mount |

Things in Tier 1 that are **never** touched: your media library (`DATA_ROOT`), backups (`BACKUP_DIR`), Docker itself, Node.js, system packages.

#### Tier 2 (opt-in flags)

| Flag | What it adds |
|---|---|
| `--remove-images` | Pulled vendor images — `qmcgaw/gluetun`, `lscr.io/linuxserver/sonarr`, etc. Each `rmi` is best-effort: Docker refuses if another container on the host still uses it, which is the safe behavior. |
| `--purge-data` | `rm -rf` of `DATA_ROOT` (your media library). Requires you to type `DELETE` at a confirmation prompt. **Refuses to run if `DATA_ROOT` is a mount point** (so it can't accidentally delete the contents of your NAS). |
| `--purge-backups` | `rm -rf` of `BACKUP_DIR`. Same typed-`DELETE` prompt, same mount-point refusal. |
| `--remove-docker` | `apt remove` Docker + `containerd` + the buildx / compose / rootless / model plugins, deletes `/etc/apt/sources.list.d/docker.list` and `/etc/apt/keyrings/docker.asc`, and runs `gpasswd -d $USER docker`. Refuses if other (non-MMC) containers or images exist on the host — override with `--force`. |
| `--wipe-docker-data` | `rm -rf /var/lib/docker /var/lib/containerd`. **Requires `--remove-docker`** — the script errors out if you pass this alone. This is the only step that removes data shared by all Docker users; double-think before passing it. |
| `--remove-node` | `apt remove nodejs`, plus `/etc/apt/sources.list.d/nodesource.list` and the NodeSource keyring. |
| `--remove-nas-packages` | `apt remove nfs-common cifs-utils smbclient`, **only if no other NFS/CIFS entries remain in `/etc/fstab`** (it greps to check). `rsync` is never removed — too widely used by other tools. |
| `--force` | Skips the "other Docker artifacts exist on this host" safety guard for `--remove-docker`. Use when you really do want to nuke a Dockerised setup that has unrelated containers. |
| `--yes` | Required to apply any of the above. Without it the script is a dry-run. |

### Safety mechanisms

These are baked into the script — no flags needed.

- **Dry-run by default.** The first invocation always prints the plan ("would remove…") with size estimates and exits without changing anything. The suggested rerun command at the bottom echoes the exact flags you passed, so you can review then re-run with `--yes` appended.
- **Self-copy to `/tmp` before doing anything.** Tier 1 deletes `~/mmc/` — including `scripts/uninstall.sh` itself. Before parsing arguments the script copies itself to `/tmp/mmc-uninstall-$$.sh`, re-execs from there, and an `EXIT` trap removes the `/tmp` copy when it finishes. You can't accidentally pull the rug out mid-run.
- **Typed `DELETE` confirmation** for `--purge-data` and `--purge-backups`. The script reads from `/dev/tty` and proceeds only if you type exactly `DELETE` — `y`, `yes`, `Y`, etc. all cancel. Designed so it survives careless piping (`yes | …` won't bypass it).
- **Mount-point detection.** Before any `rm -rf` of `DATA_ROOT` or `BACKUP_DIR`, the script calls `mountpoint -q`. If the path is currently a mount point, the purge is refused and prints a message — it never recurses into a NAS.
- **fstab cleanup by exact field-2 match.** When removing the NAS line, the script matches the `_mount_point` in the 2nd column of `/etc/fstab` (surrounded by whitespace), not a loose substring. Other entries can't get caught up in the deletion.
- **"Other Docker users" guard.** `--remove-docker` runs `docker ps -a` and refuses if any non-MMC containers exist on the host. It lists the affected containers before exiting. Override with `--force` if that's genuinely your intent.
- **System essentials are off-limits.** `rsync`, `git`, `curl`, `ca-certificates`, and `apt-transport-https` are never removed by any flag combination.
- **Logging.** Every run is mirrored to `/tmp/mmc-uninstall-YYYYMMDD-HHMMSS.log` so you can review what happened, even if Tier 1 deletes `~/.mmc/logs/` along the way.

### Common scenarios

**Stop using MMC but keep my media library.**
```bash
./scripts/uninstall.sh             # preview
./scripts/uninstall.sh --yes       # apply
```
Removes the stack and configs; leaves `DATA_ROOT` (the media library) and `BACKUP_DIR` intact, plus Docker and Node so you can install something else.

**Reclaim disk by removing the pulled vendor images too.**
```bash
./scripts/uninstall.sh --remove-images
./scripts/uninstall.sh --remove-images --yes
```

**Completely remove media library and backups.**
```bash
./scripts/uninstall.sh --purge-data --purge-backups
./scripts/uninstall.sh --purge-data --purge-backups --yes
```
You'll be prompted to type `DELETE` once for each. Refuses if `DATA_ROOT` is a NAS mount — see "NAS-backed installs" below.

**Decommission the VM entirely.**
```bash
./scripts/uninstall.sh \
    --remove-images \
    --purge-data \
    --purge-backups \
    --remove-docker \
    --wipe-docker-data \
    --remove-node \
    --remove-nas-packages

./scripts/uninstall.sh \
    --yes \
    --remove-images \
    --purge-data \
    --purge-backups \
    --remove-docker \
    --wipe-docker-data \
    --remove-node \
    --remove-nas-packages
```
After this run the only thing MMC will have left behind is your user account membership records — no files, no packages, no daemons. Re-running the install one-liner on a fresh OS would be no different from the first time.

**Multi-purpose host: I run other Docker containers too.**
```bash
# Default Tier 1 is already safe — it only touches MMC's containers and networks.
./scripts/uninstall.sh --yes
```
Do **not** pass `--remove-docker`. If you do anyway, the script will refuse (and list the other containers) unless you also pass `--force`.

### NAS-backed installs

If you set up the NAS option during install, `DATA_ROOT` was changed to the mount point (e.g. `/mnt/nas/media`). The uninstaller will:

1. Unmount it (`sudo umount $DATA_ROOT`)
2. Remove the matching line from `/etc/fstab`
3. **Refuse `--purge-data`** even with the typed-`DELETE` confirmation, because the path is a mount target. You delete the contents on the NAS side, not from the VM. Once you've cleaned up there, you can `rmdir` the mount point dir manually.

### What's left intact afterwards

After a default `--yes` run with no opt-in flags, this is still present on the host:

- `DATA_ROOT` — your media library (often many TB)
- `BACKUP_DIR` — your backup archives
- Docker engine + the pulled images (so `docker images` still shows the LinuxServer images, etc.)
- Node.js
- Any apt packages MMC installed for NAS (`nfs-common`, `cifs-utils`, `smbclient`)
- `/etc/apt/keyrings/docker.asc`, `/etc/apt/sources.list.d/docker.list`, `/etc/apt/sources.list.d/nodesource.list`
- Your user's `docker` group membership (only removed by `--remove-docker`)

The uninstaller prints a summary at the end listing exactly what's left, so you can decide whether to make a second pass with the appropriate flags.

### Manual cleanup (if you'd rather not use the script)

The same operations by hand:

```bash
# Stop and remove containers + networks
cd ~/mmc && docker compose down --remove-orphans
docker network rm mmc_medianet mmc_default
docker rmi mmc-media-ui:latest

# Remove configs and the repo (leaves media + backups + Docker alone)
rm -rf ~/.mmc/config ~/.mmc/logs ~/.mmc/install-path ~/.mmc/.nas-credentials
rm -rf ~/mmc

# Remove the systemd unit if you installed it
sudo systemctl disable --now mmc.service
sudo rm -f /etc/systemd/system/mmc.service
sudo systemctl daemon-reload

# Optional: media library and backups
rm -rf ~/.mmc/data ~/.mmc/backups
```

For removing Docker, Node, or the apt repos by hand, see the equivalent commands the script runs — they're documented inline in `scripts/uninstall.sh`.

