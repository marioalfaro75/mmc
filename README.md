# Mars Media Centre

A fully automated, containerized media centre stack using Docker Compose. Manages the complete lifecycle: requesting media, finding sources, downloading via VPN-protected clients, organising libraries, and streaming through Plex.

All 14 services are pre-configured to work together with hardlink support, VPN kill-switch protection for download clients, and a unified web dashboard.

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
                    │
              Tautulli (monitoring)
```

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A VPN account (ProtonVPN, Mullvad, AirVPN, etc.)
- A Plex account ([plex.tv/claim](https://plex.tv/claim) token needed for first run)
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
3. Clone the repository (default: `~/mmc`)
4. Launch the interactive setup wizard and staged deploy

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

## Deploy Script

```bash
./scripts/deploy.sh              # Interactive wizard (first run) or quick deploy
./scripts/deploy.sh --install    # Full bootstrap: install prerequisites, clone, deploy
./scripts/deploy.sh --update     # Pull latest code, migrate .env, rebuild all
./scripts/deploy.sh --dry-run    # Pre-flight validation only (no containers)
./scripts/deploy.sh --skip-ui    # Skip npm install/build steps
./scripts/deploy.sh --help       # Show all options
```

### First Deploy

On first run (no `.env` file), the wizard walks through:

1. VPN provider and credentials
2. Storage paths (`DATA_ROOT`, `CONFIG_ROOT`, `BACKUP_DIR`)
3. User/group IDs and Plex claim token

Then runs a staged deploy: VPN first (with healthcheck), then download clients, arr stack, media servers, operations, and finally the web UI.

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

Watchtower checks for updated Docker images daily at 4 AM (configurable via `WATCHTOWER_SCHEDULE`). Only containers with `com.centurylinklabs.watchtower.enable=true` are updated. Plex and the custom UI are excluded.

### Manual Image Updates

```bash
docker compose pull    # Pull latest images
docker compose up -d   # Recreate changed containers
```

### Pinning Versions

Edit `.env` to pin specific versions instead of `latest`:

```env
IMAGE_SONARR=lscr.io/linuxserver/sonarr:4.0.0
IMAGE_RADARR=lscr.io/linuxserver/radarr:5.2.0
```

## Post-Deploy Configuration

Complete these steps in order after first deploy. The web UI also has a full interactive guide at `http://localhost:3000/guide`.

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
   - Set default save path: Options → Downloads → Default Save Path → `/data/torrents`
   - Add categories (right-click left panel → New Category):
     - `radarr` → Save path: `/data/torrents/movies`
     - `sonarr` → Save path: `/data/torrents/tv`
   - **Network binding** (important for VPN kill-switch): Options → Advanced → Network Interface → `tun0`
   - Disable UPnP/NAT-PMP: Options → Connection → uncheck both
   - Recommended: Options → BitTorrent → Seeding Limits → set ratio/time limits

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
   - Connect to arr apps: Settings → Apps → Add Application:
     - Sonarr: Prowlarr Server `http://prowlarr:9696`, Sonarr Server `http://sonarr:8989`, API Key from Sonarr
     - Radarr: Prowlarr Server `http://prowlarr:9696`, Radarr Server `http://radarr:7878`, API Key from Radarr
   - After adding apps, click "Sync App Indexers" to push indexers to Sonarr/Radarr

5. **Sonarr** (`localhost:8989`):
   - Root folder: Settings → Media Management → Add Root Folder → `/data/media/tv`
   - Download clients: Settings → Download Clients → Add:
     - qBittorrent: Host `gluetun`, Port `8080`, Category `sonarr`
     - SABnzbd: Host `gluetun`, Port `8081`, API Key from SABnzbd, Category `tv`
   - Naming: Settings → Media Management → Rename Episodes → Yes
   - Recommended episode format: `{Series TitleYear} - S{season:00}E{episode:00} - {Episode CleanTitle} [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}`
   - Find your API key: Settings → General → API Key (needed for other services)

6. **Radarr** (`localhost:7878`):
   - Root folder: Settings → Media Management → Add Root Folder → `/data/media/movies`
   - Download clients: Settings → Download Clients → Add:
     - qBittorrent: Host `gluetun`, Port `8080`, Category `radarr`
     - SABnzbd: Host `gluetun`, Port `8081`, API Key from SABnzbd, Category `movies`
   - Naming: Settings → Media Management → Rename Movies → Yes
   - Recommended movie format: `{Movie CleanTitle} {(Release Year)} [imdbid-{ImdbId}] - [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}`
   - Find your API key: Settings → General → API Key

7. **Unpackerr**:
   - Add Sonarr/Radarr API keys to `docker-compose.yml` under the `unpackerr` service environment variables:
     ```yaml
     UN_SONARR_0_API_KEY: <sonarr-api-key>
     UN_RADARR_0_API_KEY: <radarr-api-key>
     ```
   - Recreate the container: `docker compose up -d unpackerr`

### Phase 3: Plex & Companions

8. **Plex** (`localhost:32400/web`):
   - On first access, claim the server with your Plex account (requires the `PLEX_CLAIM` token set during deploy)
   - Add libraries: Settings → Libraries → Add Library:
     - Movies → Add folder → `/movies`
     - TV Shows → Add folder → `/tv`
   - Remote access: Settings → Remote Access → Enable Remote Access
   - If remote access fails, ensure port 32400 is forwarded on your router

9. **Bazarr** (`localhost:6767`):
   - Connect to Sonarr: Settings → Sonarr → Enabled, Address `sonarr`, Port `8989`, API Key
   - Connect to Radarr: Settings → Radarr → Enabled, Address `radarr`, Port `7878`, API Key
   - Add subtitle providers: Settings → Providers → Add (OpenSubtitles, Addic7ed, etc.)
   - Set languages: Settings → Languages → add your preferred subtitle language(s)

10. **Tautulli** (`localhost:8181`):
    - Run the setup wizard, which will auto-detect the local Plex server
    - If prompted for Plex connection: Host `plex`, Port `32400`
    - Sign in with your Plex account to access viewing history and statistics

### Phase 4: Request Management

11. **Seerr** (`localhost:5055`):
    - Sign in with your Plex account on first access
    - Add Radarr: Settings → Radarr → Add Server:
      - Server Name: `Radarr`, Hostname `radarr`, Port `7878`, API Key, Root Folder `/data/media/movies`, Quality Profile
    - Add Sonarr: Settings → Sonarr → Add Server:
      - Server Name: `Sonarr`, Hostname `sonarr`, Port `8989`, API Key, Root Folder `/data/media/tv`, Quality Profile
    - Configure user permissions: Settings → Users → click a user → set request limits and auto-approve rules

### Phase 5: Operations

12. **Recyclarr**:
    - Edit `config/recyclarr/recyclarr.yml` with your Sonarr/Radarr API keys and base URLs
    - Reference [TRaSH-Guides](https://trash-guides.info/) for recommended custom formats and quality profiles
    - Run a sync: `docker exec recyclarr recyclarr sync`
    - Recyclarr runs automatically on a schedule — check logs: `docker logs recyclarr`

13. **Watchtower**: Verify running — `docker logs watchtower`. Watchtower auto-updates enabled containers daily at 4 AM.

14. **Backup**: Test with `./scripts/backup.sh` — verify the archive is created in your `BACKUP_DIR`

## Service URLs

| Service | Default URL | Purpose |
|---------|-------------|---------|
| Mars Media Centre UI | `http://localhost:3000` | Dashboard & management |
| qBittorrent | `http://localhost:8080` | Torrent client |
| SABnzbd | `http://localhost:8081` | Usenet client |
| Sonarr | `http://localhost:8989` | TV show management |
| Radarr | `http://localhost:7878` | Movie management |
| Prowlarr | `http://localhost:9696` | Indexer management |
| Plex | `http://localhost:32400/web` | Media streaming |
| Seerr | `http://localhost:5055` | Media requests |
| Bazarr | `http://localhost:6767` | Subtitle management |
| Tautulli | `http://localhost:8181` | Plex monitoring |
| Gluetun | `http://localhost:8000` | VPN control API |

## VPN Configuration

Gluetun supports 60+ VPN providers. Below are common examples. For the full list, see the [Gluetun provider list](https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers).

> **WireGuard vs OpenVPN:** WireGuard is faster and uses less CPU. OpenVPN has broader provider support. Use WireGuard when your provider offers it.

### ProtonVPN (WireGuard)

```env
VPN_SERVICE_PROVIDER=protonvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Netherlands
```

Generate WireGuard credentials at [account.protonvpn.com](https://account.protonvpn.com) → WireGuard configuration.

### Mullvad

```env
VPN_SERVICE_PROVIDER=mullvad
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Switzerland
```

Get your WireGuard key from [mullvad.net/account](https://mullvad.net/account) → WireGuard configuration.

### AirVPN

```env
VPN_SERVICE_PROVIDER=airvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
WIREGUARD_PRESHARED_KEY=<your-preshared-key>
SERVER_COUNTRIES=Netherlands
```

Generate keys at [airvpn.org](https://airvpn.org) → Client Area → VPN Devices.

### Private Internet Access (PIA)

```env
VPN_SERVICE_PROVIDER=private internet access
VPN_TYPE=openvpn
OPENVPN_USER=<your-pia-username>
OPENVPN_PASSWORD=<your-pia-password>
SERVER_REGIONS=Netherlands
```

PIA also supports WireGuard — Gluetun handles key generation automatically with your credentials.

### NordVPN

```env
VPN_SERVICE_PROVIDER=nordvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
SERVER_COUNTRIES=Netherlands
```

Generate a WireGuard private key via the [NordVPN Linux app](https://support.nordvpn.com/hc/en-us/articles/20196094470929) or use OpenVPN with your service credentials from [my.nordaccount.com](https://my.nordaccount.com).

### Surfshark

```env
VPN_SERVICE_PROVIDER=surfshark
VPN_TYPE=openvpn
OPENVPN_USER=<your-surfshark-username>
OPENVPN_PASSWORD=<your-surfshark-password>
SERVER_COUNTRIES=Netherlands
```

Get your service credentials from [my.surfshark.com](https://my.surfshark.com) → Manual setup → Router → OpenVPN.

### Windscribe

```env
VPN_SERVICE_PROVIDER=windscribe
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
WIREGUARD_PRESHARED_KEY=<your-preshared-key>
SERVER_COUNTRIES=Netherlands
```

Generate WireGuard config at [windscribe.com/getconfig/wireguard](https://windscribe.com/getconfig/wireguard).

## Verifying VPN Works

```bash
# Check Gluetun's VPN IP (should NOT be your real IP)
docker exec gluetun wget -qO- https://ipinfo.io

# Verify qBittorrent is also behind VPN
docker exec qbittorrent wget -qO- https://ipinfo.io

# Both should show the same VPN IP address
```

## Hardlink Verification

Hardlinks save disk space by avoiding duplicate copies. All paths must be on the same filesystem.

```bash
# Check inodes — same inode number = hardlink working
ls -li /data/media/movies/SomeMovie/
ls -li /data/torrents/movies/SomeMovie/
# If inode numbers match, hardlinks are working correctly
```

## Backup & Restore

### Manual Backup

```bash
./scripts/backup.sh
# Creates: ~/.mmc/backups/mars-media-centre-backup-YYYY-MM-DD-HHMMSS.tar.gz
# Automatically keeps last 7 backups
```

### Automated Backup (cron)

```bash
# Add to crontab (daily at 3 AM)
crontab -e
0 3 * * * /path/to/mmc/scripts/backup.sh >> /var/log/mars-media-centre-backup.log 2>&1
```

### Restore

```bash
./scripts/restore.sh ~/.mmc/backups/mars-media-centre-backup-2024-01-15-030000.tar.gz
# Stops containers, restores configs, sets permissions
# Then run: docker compose up -d
```

## Web UI

The Mars Media Centre dashboard at `http://localhost:3000` provides:

- Combined download queue (torrents + usenet)
- Merged calendar (TV episodes + movies)
- Library browsing with search and add
- System health monitoring and VPN status
- Media request management
- Storage path configuration and stack restart

### Settings Page

The Settings page (`http://localhost:3000/settings`) includes:

- **Storage Paths** — Edit `DATA_ROOT`, `CONFIG_ROOT`, and `BACKUP_DIR` directly from the browser. Save writes to `.env` and "Restart Stack" recreates all containers with the new paths.
- **Service Connections** — Test connectivity to each service with one click.
- **Appearance** — Toggle dark/light theme.

### Rebuilding the UI

```bash
docker compose build media-ui
docker compose up -d media-ui
```

Individual service web UIs remain accessible at their respective ports for advanced configuration.

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

Replace `sonarr` with any container name: `gluetun`, `qbittorrent`, `sabnzbd`, `prowlarr`, `sonarr`, `radarr`, `unpackerr`, `plex`, `bazarr`, `tautulli`, `seerr`, `recyclarr`, `watchtower`, `media-ui`.

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
