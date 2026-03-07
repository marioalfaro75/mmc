'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, Terminal, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';

interface AccordionSectionProps {
  title: string;
  port?: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function AccordionSection({ title, port, description, defaultOpen = false, children }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          {port && (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{port}</p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="mt-3 border-t border-border pt-3 text-sm">{children}</div>}
    </Card>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">{children}</pre>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
      <strong className="text-foreground">Tip:</strong> {children}
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Setup Guide</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Step-by-step instructions for configuring each service after deployment.
        Work through the phases in order — each builds on the previous one.
      </p>

      {/* Quick Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Quick Reference
          </CardTitle>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium">Container Management</p>
            <Pre>{`docker compose up -d          # Start all services
docker compose down           # Stop all (preserves data)
docker compose restart        # Restart all
docker logs -f <name>         # Follow container logs
docker restart <name>         # Restart one container`}</Pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium">Useful Commands</p>
            <Pre>{`docker exec gluetun wget -qO- https://ipinfo.io  # Check VPN IP
docker compose up -d --build media-ui             # Rebuild UI
docker compose pull && docker compose up -d       # Update images
./scripts/backup.sh                               # Manual backup`}</Pre>
          </div>
        </div>
      </Card>

      {/* Phase 1 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Phase 1: VPN & Download Clients</h2>
        <div className="space-y-3">
          <AccordionSection
            title="Gluetun (VPN)"
            port="localhost:8000"
            description="VPN gateway — all download traffic is routed through this container"
            defaultOpen
          >
            <p>Gluetun supports 60+ VPN providers. Set your credentials in <Code>.env</Code> during deploy, or edit it manually.</p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Provider Examples</h4>

            <p className="mt-2 text-xs font-medium">ProtonVPN (WireGuard)</p>
            <Pre>{`VPN_SERVICE_PROVIDER=protonvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Netherlands`}</Pre>

            <p className="mt-2 text-xs font-medium">Mullvad (WireGuard)</p>
            <Pre>{`VPN_SERVICE_PROVIDER=mullvad
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
SERVER_COUNTRIES=Switzerland`}</Pre>

            <p className="mt-2 text-xs font-medium">AirVPN (WireGuard)</p>
            <Pre>{`VPN_SERVICE_PROVIDER=airvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
WIREGUARD_PRESHARED_KEY=<your-preshared-key>
SERVER_COUNTRIES=Netherlands`}</Pre>

            <p className="mt-2 text-xs font-medium">Private Internet Access (OpenVPN)</p>
            <Pre>{`VPN_SERVICE_PROVIDER=private internet access
VPN_TYPE=openvpn
OPENVPN_USER=<your-pia-username>
OPENVPN_PASSWORD=<your-pia-password>
SERVER_REGIONS=Netherlands`}</Pre>

            <p className="mt-2 text-xs font-medium">NordVPN (WireGuard)</p>
            <Pre>{`VPN_SERVICE_PROVIDER=nordvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
SERVER_COUNTRIES=Netherlands`}</Pre>

            <p className="mt-2 text-xs font-medium">Surfshark (OpenVPN)</p>
            <Pre>{`VPN_SERVICE_PROVIDER=surfshark
VPN_TYPE=openvpn
OPENVPN_USER=<your-surfshark-username>
OPENVPN_PASSWORD=<your-surfshark-password>
SERVER_COUNTRIES=Netherlands`}</Pre>

            <p className="mt-2 text-xs font-medium">Windscribe (WireGuard)</p>
            <Pre>{`VPN_SERVICE_PROVIDER=windscribe
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=<your-private-key>
WIREGUARD_ADDRESSES=<your-address>/32
WIREGUARD_PRESHARED_KEY=<your-preshared-key>
SERVER_COUNTRIES=Netherlands`}</Pre>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Verification</h4>
            <Pre>{`# Should show VPN IP, NOT your real IP
docker exec gluetun wget -qO- https://ipinfo.io

# Verify download clients also use VPN
docker exec qbittorrent wget -qO- https://ipinfo.io`}</Pre>

            <Tip>
              WireGuard is faster and uses less CPU than OpenVPN. Use it when your provider supports it.
              See the{' '}
              <a href="https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                full Gluetun provider list
                <ExternalLink className="ml-0.5 inline h-3 w-3" />
              </a>{' '}
              for all supported providers.
            </Tip>
          </AccordionSection>

          <AccordionSection
            title="qBittorrent"
            port="localhost:8080"
            description="Torrent download client — runs behind Gluetun VPN"
          >
            <Step n={1}>
              <p>Log in with username <Code>admin</Code>. Find the temporary password:</p>
              <Pre>docker logs qbittorrent 2&gt;&amp;1 | grep &quot;temporary password&quot;</Pre>
            </Step>
            <Step n={2}>
              <p><strong>Change the default password</strong> immediately: Options → Web UI → Authentication</p>
            </Step>
            <Step n={3}>
              <p>Set default save path: Options → Downloads → Default Save Path → <Code>/data/torrents</Code></p>
            </Step>
            <Step n={4}>
              <p>Add categories (right-click the left panel → New Category):</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li><Code>radarr</Code> → Save path: <Code>/data/torrents/movies</Code></li>
                <li><Code>sonarr</Code> → Save path: <Code>/data/torrents/tv</Code></li>
              </ul>
            </Step>
            <Step n={5}>
              <p><strong>Bind to VPN interface</strong>: Options → Advanced → Network Interface → <Code>tun0</Code></p>
              <p className="text-xs text-muted-foreground">This ensures torrents stop if VPN disconnects (kill-switch).</p>
            </Step>
            <Step n={6}>
              <p>Disable UPnP/NAT-PMP: Options → Connection → uncheck both</p>
            </Step>
            <Tip>
              Set seeding limits under Options → BitTorrent → Seeding Limits to automatically stop seeding after a ratio/time target.
            </Tip>
          </AccordionSection>

          <AccordionSection
            title="SABnzbd"
            port="localhost:8081"
            description="Usenet download client — runs behind Gluetun VPN"
          >
            <Step n={1}>
              <p>Complete the setup wizard on first access.</p>
            </Step>
            <Step n={2}>
              <p>Add your usenet server: Config → Servers → Add Server. Enter host, port, username, password, and enable SSL.</p>
            </Step>
            <Step n={3}>
              <p>Configure folders: Config → Folders:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li>Completed Download Folder: <Code>/data/usenet</Code></li>
                <li>Incomplete Download Folder: <Code>/data/usenet/incomplete</Code></li>
              </ul>
            </Step>
            <Step n={4}>
              <p>Add categories: Config → Categories:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li><Code>movies</Code> → Folder/Path: <Code>/data/usenet/movies</Code></li>
                <li><Code>tv</Code> → Folder/Path: <Code>/data/usenet/tv</Code></li>
              </ul>
            </Step>
            <Tip>
              Your SABnzbd API key is at Config → General → API Key. You will need it for Sonarr/Radarr.
            </Tip>
          </AccordionSection>
        </div>
      </div>

      {/* Phase 2 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Phase 2: Indexers & Media Managers</h2>
        <div className="space-y-3">
          <AccordionSection
            title="Prowlarr"
            port="localhost:9696"
            description="Indexer manager — centralises tracker/indexer config for Sonarr and Radarr"
          >
            <Step n={1}>
              <p>Add indexers: Indexers → Add Indexer. Search for your torrent trackers or usenet indexers and configure credentials.</p>
            </Step>
            <Step n={2}>
              <p>Connect to arr apps: Settings → Apps → Add Application:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li><strong>Sonarr:</strong> Prowlarr Server <Code>http://prowlarr:9696</Code>, Sonarr Server <Code>http://sonarr:8989</Code>, API Key from Sonarr</li>
                <li><strong>Radarr:</strong> Prowlarr Server <Code>http://prowlarr:9696</Code>, Radarr Server <Code>http://radarr:7878</Code>, API Key from Radarr</li>
              </ul>
            </Step>
            <Step n={3}>
              <p>Click &quot;Sync App Indexers&quot; to push your indexers to Sonarr and Radarr.</p>
            </Step>
            <Tip>
              Use container hostnames (e.g. <Code>sonarr</Code>, <Code>radarr</Code>) not <Code>localhost</Code> — containers communicate over the Docker network.
            </Tip>
          </AccordionSection>

          <AccordionSection
            title="Sonarr"
            port="localhost:8989"
            description="TV show management — monitors, downloads, and organises TV series"
          >
            <Step n={1}>
              <p>Add root folder: Settings → Media Management → Add Root Folder → <Code>/data/media/tv</Code></p>
            </Step>
            <Step n={2}>
              <p>Add download clients: Settings → Download Clients → Add:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li><strong>qBittorrent:</strong> Host <Code>gluetun</Code>, Port <Code>8080</Code>, Category <Code>sonarr</Code></li>
                <li><strong>SABnzbd:</strong> Host <Code>gluetun</Code>, Port <Code>8081</Code>, API Key from SABnzbd, Category <Code>tv</Code></li>
              </ul>
            </Step>
            <Step n={3}>
              <p>Enable renaming: Settings → Media Management → Rename Episodes → Yes</p>
              <p className="mt-1 text-xs text-muted-foreground">Recommended format:</p>
              <Pre>{`{Series TitleYear} - S{season:00}E{episode:00} - {Episode CleanTitle} [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}`}</Pre>
            </Step>
            <Step n={4}>
              <p>Note your API key: Settings → General → API Key (needed for Prowlarr, Bazarr, Seerr, Unpackerr, Recyclarr)</p>
            </Step>
          </AccordionSection>

          <AccordionSection
            title="Radarr"
            port="localhost:7878"
            description="Movie management — monitors, downloads, and organises movies"
          >
            <Step n={1}>
              <p>Add root folder: Settings → Media Management → Add Root Folder → <Code>/data/media/movies</Code></p>
            </Step>
            <Step n={2}>
              <p>Add download clients: Settings → Download Clients → Add:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li><strong>qBittorrent:</strong> Host <Code>gluetun</Code>, Port <Code>8080</Code>, Category <Code>radarr</Code></li>
                <li><strong>SABnzbd:</strong> Host <Code>gluetun</Code>, Port <Code>8081</Code>, API Key from SABnzbd, Category <Code>movies</Code></li>
              </ul>
            </Step>
            <Step n={3}>
              <p>Enable renaming: Settings → Media Management → Rename Movies → Yes</p>
              <p className="mt-1 text-xs text-muted-foreground">Recommended format:</p>
              <Pre>{`{Movie CleanTitle} {(Release Year)} [imdbid-{ImdbId}] - [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}`}</Pre>
            </Step>
            <Step n={4}>
              <p>Note your API key: Settings → General → API Key (needed for Prowlarr, Bazarr, Seerr, Unpackerr, Recyclarr)</p>
            </Step>
          </AccordionSection>

          <AccordionSection
            title="Unpackerr"
            description="Automatically extracts archived downloads for Sonarr and Radarr"
          >
            <Step n={1}>
              <p>Edit <Code>docker-compose.yml</Code> under the <Code>unpackerr</Code> service and add your API keys:</p>
              <Pre>{`UN_SONARR_0_API_KEY: <sonarr-api-key>
UN_RADARR_0_API_KEY: <radarr-api-key>`}</Pre>
            </Step>
            <Step n={2}>
              <p>Recreate the container to apply changes:</p>
              <Pre>docker compose up -d unpackerr</Pre>
            </Step>
            <Step n={3}>
              <p>Verify it connected: <Code>docker logs unpackerr</Code> — look for &quot;Sonarr&quot; and &quot;Radarr&quot; connected messages.</p>
            </Step>
          </AccordionSection>
        </div>
      </div>

      {/* Phase 3 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Phase 3: Media Server & Companions</h2>
        <div className="space-y-3">
          <AccordionSection
            title="Plex"
            port="localhost:32400/web"
            description="Media streaming server — streams your library to any device"
          >
            <Step n={1}>
              <p>On first access, claim the server with your Plex account. This uses the <Code>PLEX_CLAIM</Code> token set during deploy.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                If the token expired, generate a new one at{' '}
                <a href="https://plex.tv/claim" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  plex.tv/claim
                  <ExternalLink className="ml-0.5 inline h-3 w-3" />
                </a>
                {' '}and update <Code>PLEX_CLAIM</Code> in <Code>.env</Code>.
              </p>
            </Step>
            <Step n={2}>
              <p>Add libraries: Settings → Libraries → Add Library:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li>Movies → Add folder → <Code>/movies</Code></li>
                <li>TV Shows → Add folder → <Code>/tv</Code></li>
              </ul>
            </Step>
            <Step n={3}>
              <p>Enable remote access: Settings → Remote Access → Enable Remote Access</p>
              <p className="text-xs text-muted-foreground">If it fails, ensure port 32400 is forwarded on your router.</p>
            </Step>
            <Tip>
              Plex claim tokens expire after 4 minutes. Generate and use it quickly during first setup.
            </Tip>
          </AccordionSection>

          <AccordionSection
            title="Bazarr"
            port="localhost:6767"
            description="Subtitle management — automatically downloads subtitles for your media"
          >
            <Step n={1}>
              <p>Connect to Sonarr: Settings → Sonarr → Enable, Address <Code>sonarr</Code>, Port <Code>8989</Code>, API Key</p>
            </Step>
            <Step n={2}>
              <p>Connect to Radarr: Settings → Radarr → Enable, Address <Code>radarr</Code>, Port <Code>7878</Code>, API Key</p>
            </Step>
            <Step n={3}>
              <p>Add subtitle providers: Settings → Providers → click the &quot;+&quot; icon. Popular options:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li>OpenSubtitles.com (requires free account)</li>
                <li>Addic7ed</li>
                <li>Subscene</li>
              </ul>
            </Step>
            <Step n={4}>
              <p>Set languages: Settings → Languages → add your preferred subtitle language(s) and set as default.</p>
            </Step>
          </AccordionSection>

          <AccordionSection
            title="Tautulli"
            port="localhost:8181"
            description="Plex monitoring — tracks viewing history, statistics, and notifications"
          >
            <Step n={1}>
              <p>Complete the setup wizard on first access. It will auto-detect the local Plex server.</p>
            </Step>
            <Step n={2}>
              <p>If prompted, use Plex connection details: Host <Code>plex</Code>, Port <Code>32400</Code></p>
            </Step>
            <Step n={3}>
              <p>Sign in with your Plex account to access viewing history and statistics.</p>
            </Step>
            <Tip>
              Tautulli can send notifications (Discord, email, etc.) for new additions and playback events. Configure under Settings → Notification Agents.
            </Tip>
          </AccordionSection>
        </div>
      </div>

      {/* Phase 4 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Phase 4: Requests & Operations</h2>
        <div className="space-y-3">
          <AccordionSection
            title="Seerr"
            port="localhost:5055"
            description="Media request management — lets users request movies and TV shows"
          >
            <Step n={1}>
              <p>Sign in with your Plex account on first access.</p>
            </Step>
            <Step n={2}>
              <p>Add Radarr: Settings → Radarr → Add Server:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li>Server Name: <Code>Radarr</Code></li>
                <li>Hostname: <Code>radarr</Code>, Port: <Code>7878</Code></li>
                <li>API Key, Root Folder: <Code>/data/media/movies</Code>, Quality Profile</li>
              </ul>
            </Step>
            <Step n={3}>
              <p>Add Sonarr: Settings → Sonarr → Add Server:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li>Server Name: <Code>Sonarr</Code></li>
                <li>Hostname: <Code>sonarr</Code>, Port: <Code>8989</Code></li>
                <li>API Key, Root Folder: <Code>/data/media/tv</Code>, Quality Profile</li>
              </ul>
            </Step>
            <Step n={4}>
              <p>Configure user permissions: Settings → Users → click a user → set request limits and auto-approve rules.</p>
            </Step>
            <Tip>
              Share <Code>http://your-server:5055</Code> with family/friends so they can request media through a clean interface.
            </Tip>
          </AccordionSection>

          <AccordionSection
            title="Recyclarr"
            description="Syncs TRaSH-Guides custom formats and quality profiles to Sonarr/Radarr"
          >
            <Step n={1}>
              <p>Edit <Code>config/recyclarr/recyclarr.yml</Code> with your Sonarr and Radarr API keys and base URLs.</p>
            </Step>
            <Step n={2}>
              <p>Reference{' '}
                <a href="https://trash-guides.info/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  TRaSH-Guides
                  <ExternalLink className="ml-0.5 inline h-3 w-3" />
                </a>{' '}
                for recommended custom formats and quality profiles.
              </p>
            </Step>
            <Step n={3}>
              <p>Run a manual sync:</p>
              <Pre>docker exec recyclarr recyclarr sync</Pre>
            </Step>
            <Step n={4}>
              <p>Verify with: <Code>docker logs recyclarr</Code> — Recyclarr runs automatically on its configured schedule.</p>
            </Step>
          </AccordionSection>

          <AccordionSection
            title="Watchtower"
            description="Automatic Docker image updates — keeps your containers up to date"
          >
            <p>Watchtower is pre-configured and runs automatically. It checks for updated Docker images daily at 4 AM.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Only containers with <Code>com.centurylinklabs.watchtower.enable=true</Code> are updated.
              Plex and the custom UI are excluded to prevent unexpected updates.
            </p>
            <h4 className="mt-3 text-xs font-semibold">Verify it&apos;s running:</h4>
            <Pre>docker logs watchtower</Pre>
            <Tip>
              To change the schedule, edit <Code>WATCHTOWER_SCHEDULE</Code> in <Code>.env</Code> (cron format).
            </Tip>
          </AccordionSection>
        </div>
      </div>
    </div>
  );
}
