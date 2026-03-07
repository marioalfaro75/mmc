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

```bash
# 1. Clone the repository
git clone <repo-url> mars-media-centre && cd mars-media-centre

# 2. Create and configure environment
cp .env.example .env
nano .env  # Fill in VPN credentials, paths, and preferences

# 3. Create directory structure
sudo ./scripts/init.sh

# 4. Start all services
docker compose up -d

# 5. Check everything is running
docker compose ps
```

## Post-Deploy Configuration

Complete these steps in order after first `docker compose up -d`.

### Phase 1: VPN & Download Clients

1. **Verify VPN**: `docker exec gluetun wget -qO- https://ipinfo.io` — confirm VPN IP, not your real IP
2. **qBittorrent** (`localhost:8080`):
   - Default login: `admin` / check container logs for temporary password
   - Set default save path: `/data/torrents`
   - Add categories: `radarr` → `/data/torrents/movies`, `sonarr` → `/data/torrents/tv`
   - Advanced: set network interface to `tun0`, disable UPnP/NAT-PMP
3. **SABnzbd** (`localhost:8081`):
   - Run through setup wizard, add usenet server(s)
   - Set completed folder: `/data/usenet`, incomplete: `/data/usenet/incomplete`
   - Add categories: `movies` → `/data/usenet/movies`, `tv` → `/data/usenet/tv`

### Phase 2: Indexers & Media Managers

4. **Prowlarr** (`localhost:9696`):
   - Add indexers (torrent trackers, usenet indexers)
   - Add Sonarr and Radarr as applications (use container hostnames: `http://sonarr:8989`, `http://radarr:7878`)
5. **Sonarr** (`localhost:8989`):
   - Root folder: `/data/media/tv`
   - Download clients: qBittorrent (`gluetun:8080`, category: `sonarr`), SABnzbd (`gluetun:8081`, category: `tv`)
   - Enable rename episodes, configure naming format
6. **Radarr** (`localhost:7878`):
   - Root folder: `/data/media/movies`
   - Download clients: qBittorrent (`gluetun:8080`, category: `radarr`), SABnzbd (`gluetun:8081`, category: `movies`)
   - Enable rename movies, configure naming format
7. **Unpackerr**: Add Sonarr/Radarr API keys to `docker-compose.yml` environment variables, recreate container

### Phase 3: Plex & Companions

8. **Plex** (`localhost:32400/web`):
   - Claim server with your Plex account
   - Add libraries: Movies → `/movies`, TV Shows → `/tv`
   - Configure remote access if needed
9. **Bazarr** (`localhost:6767`):
   - Connect to Sonarr and Radarr with API keys
   - Add subtitle providers, set language preferences
10. **Tautulli** (`localhost:8181`):
    - Connect to Plex server

### Phase 4: Request Management

11. **Seerr** (`localhost:5055`):
    - Sign in with Plex account
    - Add Sonarr (`http://sonarr:8989`) and Radarr (`http://radarr:7878`) with API keys
    - Configure user permissions and request quotas

### Phase 5: Operations

12. **Recyclarr**: Add API keys to `config/recyclarr/recyclarr.yml`, run `docker exec recyclarr recyclarr sync`
13. **Watchtower**: Verify running — `docker logs watchtower`
14. **Backup**: Test with `./scripts/backup.sh`

## Service URLs

| Service | Default URL | Purpose |
|---------|-------------|---------|
| Unified UI | `http://localhost:3000` | Dashboard & management |
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

### ProtonVPN (WireGuard)

```env
VPN_SERVICE_PROVIDER=protonvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Netherlands
```

### Mullvad

```env
VPN_SERVICE_PROVIDER=mullvad
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Switzerland
```

### AirVPN

```env
VPN_SERVICE_PROVIDER=airvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
WIREGUARD_PRESHARED_KEY=<your-preshared-key>
SERVER_COUNTRIES=Netherlands
```

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
# Creates: backups/mars-media-centre-backup-YYYY-MM-DD-HHMMSS.tar.gz
# Automatically keeps last 7 backups
```

### Automated Backup (cron)

```bash
# Add to crontab (daily at 3 AM)
crontab -e
0 3 * * * /path/to/mars-media-centre/scripts/backup.sh >> /var/log/mars-media-centre-backup.log 2>&1
```

### Restore

```bash
./scripts/restore.sh backups/mars-media-centre-backup-2024-01-15-030000.tar.gz
# Stops containers, restores configs, sets permissions
# Then run: docker compose up -d
```

## Updating

### Automatic (Watchtower)

Watchtower checks for updates daily at 4 AM (configurable via `WATCHTOWER_SCHEDULE`). Only containers with `com.centurylinklabs.watchtower.enable=true` are updated. Plex and the custom UI are excluded.

### Manual

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

## Stopping and Starting

```bash
# Stop all services (preserves data and configs)
docker compose down

# Start all services
docker compose up -d

# Restart a single service
docker compose restart sonarr

# View logs
docker compose logs -f sonarr
```

## Uninstalling

```bash
# 1. Stop and remove containers, networks
docker compose down

# 2. Remove container configs (DESTRUCTIVE)
rm -rf config/

# 3. Remove media data (DESTRUCTIVE — your media library!)
# rm -rf /data

# 4. Remove Docker images
docker compose down --rmi all
```

## Unified Web UI

The custom dashboard at `http://localhost:3000` provides:

- Combined download queue (torrents + usenet)
- Merged calendar (TV episodes + movies)
- Library browsing with search and add
- System health monitoring and VPN status
- Media request management

### First-Time Setup

1. Deploy all services and complete post-deploy configuration above
2. Collect API keys from each service's web UI
3. Open the UI Settings page and enter connection details for each service
4. Test each connection using the built-in test button

### Rebuilding the UI

```bash
docker compose build media-ui
docker compose up -d media-ui
```

Individual service web UIs remain accessible at their respective ports for advanced configuration.
