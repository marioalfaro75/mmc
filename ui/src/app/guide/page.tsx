'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, Terminal, ExternalLink, Loader2, Zap, ShieldCheck, Key } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { toast } from 'sonner';

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

function QuickSetupQbt() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/qbittorrent/configure', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('qBittorrent configured — save path, categories, VPN binding, and seeding limit applied');
        setDone(true);
      } else if (data.authError) {
        toast.error('qBittorrent login failed — set QBITTORRENT_PASSWORD in Settings to match your current qBittorrent password, then restart the stack');
      } else {
        const failed = data.results.filter((r: { status: string }) => r.status === 'error');
        toast.error(`Some settings failed: ${failed.map((r: { step: string }) => r.step).join(', ')}`);
      }
    } catch {
      toast.error('Could not reach qBittorrent — is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Auto-configure steps 3-6: save path, categories, VPN interface binding, UPnP, and seeding ratio limit.
        You still need to change the default password manually (step 2).
      </p>
      <button
        onClick={run}
        disabled={loading || done}
        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="h-3.5 w-3.5" />
        )}
        {done ? 'Applied' : 'Quick Setup'}
      </button>
    </div>
  );
}

function QuickSetupButton({ label, description, endpoint, successMessage }: {
  label: string;
  description: string;
  endpoint: string;
  successMessage: string;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(successMessage);
        setDone(true);
      } else if (data.error) {
        toast.error(data.error);
      } else {
        const failed = data.results?.filter((r: { status: string }) => r.status === 'error') || [];
        const details = failed.map((r: { step: string; error?: string }) => r.error ? `${r.step}: ${r.error}` : r.step).join('; ');
        toast.error(`Some settings failed: ${details}`);
      }
    } catch {
      toast.error(`Could not reach ${label} — is it running?`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{description}</p>
      <button
        onClick={run}
        disabled={loading || done}
        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="h-3.5 w-3.5" />
        )}
        {done ? 'Applied' : 'Quick Setup'}
      </button>
    </div>
  );
}

function QuickSetupSeerr() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/seerr/configure', { method: 'POST' });
      const data = await res.json();
      const configured = data.results?.filter((r: { status: string }) => r.status === 'configured') || [];
      const alreadyDone = data.results?.filter((r: { status: string }) => r.status === 'already_configured') || [];
      const errors = data.results?.filter((r: { status: string }) => r.status === 'error') || [];

      if (configured.length > 0 || alreadyDone.length > 0) {
        const names = [...configured, ...alreadyDone].map((r: { service: string }) => r.service).join(', ');
        toast.success(`Seerr configured with ${names}`);
        setDone(true);
      } else if (errors.length > 0) {
        toast.error(`Failed: ${errors.map((r: { service: string; error?: string }) => `${r.service}: ${r.error || 'unknown'}`).join('; ')}`);
      } else {
        toast.error('No services could be configured — check API keys in Settings');
      }
    } catch {
      toast.error('Could not reach Seerr — is it running? Have you signed in at localhost:5055?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Auto-connect Sonarr and Radarr to Seerr using your existing API keys and default quality profiles.
        You must sign in to Seerr first (step 1).
      </p>
      <button
        onClick={run}
        disabled={loading || done}
        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="h-3.5 w-3.5" />
        )}
        {done ? 'Applied' : 'Quick Setup'}
      </button>
    </div>
  );
}

function DetectApiKeys() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'restarting' | 'done'>('idle');

  const waitForRestart = async () => {
    // Wait a moment for the restart to initiate
    await new Promise((r) => setTimeout(r, 3000));
    // Poll until media-ui comes back
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
        if (res.ok) return true;
      } catch {
        // still restarting
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/detect-keys', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const count = data.detected?.length || 0;
        const missingMsg = data.missing?.length ? ` (not found: ${data.missing.join(', ')})` : '';
        toast.info(`Detected ${count} API key${count !== 1 ? 's' : ''}${missingMsg}. Restarting services...`);
        setStatus('restarting');
        const cameBack = await waitForRestart();
        if (cameBack) {
          toast.success('API keys applied — services restarted. You can now run Quick Setup below.');
          setStatus('done');
        } else {
          toast.warning('API keys saved but the UI is taking a while to restart. Refresh the page in a moment.');
          setStatus('done');
        }
      } else {
        toast.error(data.error || 'Failed to detect API keys');
      }
    } catch {
      // The fetch may fail if media-ui restarts before the response completes
      toast.info('Detecting keys and restarting services...');
      setStatus('restarting');
      const cameBack = await waitForRestart();
      if (cameBack) {
        toast.success('API keys applied — services restarted. You can now run Quick Setup below.');
        setStatus('done');
      } else {
        toast.warning('Services are restarting. Refresh the page in a moment.');
        setStatus('done');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-medium">Auto-detect API Keys</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Reads API keys directly from Sonarr, Radarr, Prowlarr, Seerr, and Bazarr config files and saves them to Settings.
        Also populates Unpackerr keys automatically. Automatically restarts services to apply.
      </p>
      <button
        onClick={run}
        disabled={loading || status !== 'idle'}
        className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="h-3.5 w-3.5" />
        )}
        {status === 'restarting' ? 'Restarting...' : status === 'done' ? 'Keys Applied' : 'Detect API Keys'}
      </button>
    </div>
  );
}

function QuickSetupTmdb() {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'restarting' | 'done'>('idle');

  const waitForRestart = async () => {
    await new Promise((r) => setTimeout(r, 3000));
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('/api/tmdb/status', { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          if (data.configured) return true;
        }
      } catch { /* still restarting */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };

  const run = async () => {
    if (!key.trim()) {
      toast.error('Please enter your TMDB API key');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/settings/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars: { TMDB_API_KEY: key.trim() } }),
      });
      if (res.ok) {
        toast.info('TMDB API key saved — restarting services...');
        setStatus('restarting');
        // Restart media-ui so it picks up the new env var
        try {
          await fetch('/api/settings/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ services: ['media-ui'] }),
          });
        } catch { /* restart may kill the connection */ }
        const cameBack = await waitForRestart();
        if (cameBack) {
          toast.success('TMDB API key applied — actor search is now enabled in Add Movie/Series');
          setStatus('done');
        } else {
          toast.warning('Key saved but restart is taking a while. Refresh the page in a moment.');
          setStatus('done');
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save TMDB key');
      }
    } catch {
      toast.info('Saving key and restarting...');
      setStatus('restarting');
      const cameBack = await waitForRestart();
      if (cameBack) {
        toast.success('TMDB API key applied — actor search is now enabled');
        setStatus('done');
      } else {
        toast.warning('Key saved. Refresh the page in a moment.');
        setStatus('done');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Paste your TMDB API key below to enable searching for movies and TV shows by actor name.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste TMDB API key..."
          disabled={status !== 'idle'}
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          onClick={run}
          disabled={loading || status !== 'idle'}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Key className="h-3.5 w-3.5" />
          )}
          {status === 'restarting' ? 'Restarting...' : status === 'done' ? 'Saved' : 'Save Key'}
        </button>
      </div>
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
              <p><strong>Change the default password</strong> immediately: Options → Web UI → Authentication.</p>
              <p className="text-xs text-muted-foreground">Then set the same password in this web UI under Settings → <Code>QBITTORRENT_PASSWORD</Code> and restart the stack so the dashboard can connect.</p>
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
            <QuickSetupQbt />
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
          <DetectApiKeys />
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
            <QuickSetupButton
              label="Prowlarr"
              endpoint="/api/prowlarr/configure"
              description="Auto-configure steps 2-3: connect Sonarr and Radarr as applications. You still need to add indexers manually (step 1)."
              successMessage="Prowlarr configured — Sonarr and Radarr connected as applications"
            />
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
            <QuickSetupButton
              label="Sonarr"
              endpoint="/api/sonarr/configure"
              description="Auto-configure steps 1-3: root folder, download clients (qBittorrent + SABnzbd if key is set), and episode renaming format."
              successMessage="Sonarr configured — root folder, download clients, and naming format applied"
            />
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
            <QuickSetupButton
              label="Radarr"
              endpoint="/api/radarr/configure"
              description="Auto-configure steps 1-3: root folder, download clients (qBittorrent + SABnzbd if key is set), and movie renaming format."
              successMessage="Radarr configured — root folder, download clients, and naming format applied"
            />
          </AccordionSection>

          <AccordionSection
            title="Unpackerr"
            description="Automatically extracts archived downloads for Sonarr and Radarr"
          >
            <Step n={1}>
              <p>If you ran <strong>Detect API Keys</strong> above, the Unpackerr keys are already set. Otherwise, set <Code>UN_SONARR_0_API_KEY</Code> and <Code>UN_RADARR_0_API_KEY</Code> in Settings to match your Sonarr and Radarr API keys.</p>
            </Step>
            <Step n={2}>
              <p>Restart the stack so Unpackerr picks up the new keys.</p>
            </Step>
            <Step n={3}>
              <p>Verify it connected: <Code>docker logs unpackerr</Code> — look for &quot;Sonarr&quot; and &quot;Radarr&quot; connected messages.</p>
            </Step>
          </AccordionSection>

          <AccordionSection
            title="TMDB (The Movie Database)"
            description="Optional — enables searching for movies and TV shows by actor name"
          >
            <p>
              By default, the Add Movie and Add Series dialogs search by title.
              Adding a free TMDB API key unlocks <strong>actor search</strong> —
              type an actor&apos;s name to discover their filmography and add titles directly.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Getting a TMDB API Key</h4>
            <Step n={1}>
              <p>
                Go to{' '}
                <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  themoviedb.org/signup
                  <ExternalLink className="ml-0.5 inline h-3 w-3" />
                </a>{' '}
                and create a free account.
              </p>
            </Step>
            <Step n={2}>
              <p>
                Go to{' '}
                <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Settings → API
                  <ExternalLink className="ml-0.5 inline h-3 w-3" />
                </a>{' '}
                and click <strong>Create</strong> → choose <strong>Developer</strong>.
              </p>
            </Step>
            <Step n={3}>
              <p>
                Fill in the application form (application name and URL can be anything, e.g. &quot;media centre&quot; and &quot;http://localhost&quot;).
                Accept the terms and submit.
              </p>
            </Step>
            <Step n={4}>
              <p>
                Copy the <strong>API Key (v3 auth)</strong> value. Use the Quick Setup below to save it, or paste it into
                Settings → Services → <Code>TMDB API Key</Code>.
              </p>
            </Step>

            <QuickSetupTmdb />

            <Tip>
              TMDB&apos;s free API allows 50+ requests per second — more than enough for personal use. No payment
              or credit card is required.
            </Tip>
          </AccordionSection>
        </div>
      </div>

      {/* Phase 3 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Phase 3: Media Server & Companions</h2>
        <div className="space-y-3">
          <AccordionSection
            title="Bazarr"
            port="localhost:6767"
            description="Subtitle management — automatically downloads subtitles for your media"
          >
            <QuickSetupButton
              label="Bazarr"
              endpoint="/api/bazarr/configure"
              description="Auto-configure steps 1-2: connect Bazarr to Sonarr and Radarr using detected API keys."
              successMessage="Bazarr configured — Sonarr and Radarr connections applied"
            />
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

        </div>
      </div>

      {/* Phase 4 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Phase 4: Media Migration</h2>
        <div className="space-y-3">
          <AccordionSection
            title="Media Migration"
            description="Move your media library to a NAS, network share, or another local directory"
          >
            <p>
              The <a href="/migration" className="text-primary underline">Migration page</a> guides you through
              moving your existing media files to a new location. This is optional — only needed if you want to
              move media to a different drive, directory, or network-attached storage.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Step 1: Choose Destination</h4>
            <p className="mt-1">Select the type of destination for your media:</p>
            <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
              <li><strong className="text-foreground">NAS / Network Share</strong> — an SMB or NFS share on your network (e.g. Synology, TrueNAS)</li>
              <li><strong className="text-foreground">Local Directory</strong> — another drive or path on this machine (e.g. <Code>/mnt/d</Code>, a second SSD, or an external USB drive). Use the <strong>Browse</strong> button to navigate your filesystem and select a folder.</li>
            </ul>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Step 2a: NAS Setup</h4>
            <p className="mt-1 text-xs text-muted-foreground">Only if you chose NAS / Network Share:</p>
            <Step n={1}>
              <p>Enter your NAS IP address and select a protocol (<strong>SMB</strong> for Windows/Synology shares or <strong>NFS</strong> for Linux/TrueNAS shares).</p>
            </Step>
            <Step n={2}>
              <p>Click <strong>Test Connection</strong> to verify the NAS is reachable. For SMB, enter your username and password when prompted.</p>
            </Step>
            <Step n={3}>
              <p>Select a share from the discovered list, or type a custom share name. Choose a local mount point (default: <Code>/mnt/nas</Code>).</p>
            </Step>
            <Step n={4}>
              <p>Click <strong>Generate Mount Script</strong>. This creates a mount script at <Code>~/.mmc/scripts/mount-nas.sh</Code> that you can run to mount the NAS.</p>
              <Pre>{`# Run the generated script
sudo bash ~/.mmc/scripts/mount-nas.sh`}</Pre>
            </Step>
            <Step n={5}>
              <p>Click <strong>Verify Mount</strong> to confirm the NAS is mounted and writable.</p>
            </Step>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Step 2b: Local Directory Setup</h4>
            <p className="mt-1 text-xs text-muted-foreground">Only if you chose Local Directory:</p>
            <Step n={1}>
              <p>Type a path or click <strong>Browse</strong> to navigate your filesystem. The browser shows all mounted drives including Windows drives (<Code>/mnt/c</Code>, <Code>/mnt/d</Code>), USB drives, and other mount points.</p>
            </Step>
            <Step n={2}>
              <p>Click <strong>Verify Directory</strong> to confirm the path exists, is writable, and check available disk space.</p>
            </Step>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Step 3: Migrate Media</h4>
            <Step n={1}>
              <p>Once the destination is verified, the migration panel appears. Click <strong>Run Preflight</strong> to check disk space and preview what will be copied.</p>
            </Step>
            <Step n={2}>
              <p>Click <strong>Start Migration</strong> to begin copying files. The tool uses <Code>rsync</Code> to efficiently transfer your media with a live progress bar.</p>
              <p className="mt-1 text-xs text-muted-foreground">Large libraries may take hours depending on transfer speed. You can safely close the page — the migration continues in the background.</p>
            </Step>
            <Step n={3}>
              <p>When the copy completes, the tool automatically updates Sonarr and Radarr root folders to point to the new path so all future downloads go directly to the new location.</p>
            </Step>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Folder Structure</h4>
            <p className="mt-1">The destination should end up with this layout (created automatically during migration):</p>
            <Pre>{`/your/destination/     # NAS mount or local directory
  media/
    movies/            # Radarr moves completed movies here
    tv/                # Sonarr moves completed TV shows here
  torrents/
    movies/            # qBittorrent downloads movies here
    tv/                # qBittorrent downloads TV here
  usenet/
    movies/            # SABnzbd downloads movies here
    tv/                # SABnzbd downloads TV here`}</Pre>

            <Tip>
              If you set up NAS during initial install with <Code>./scripts/deploy.sh --nas</Code>, the mount
              is already configured and you can skip the NAS setup steps. The migration page is for moving media
              on an existing install.
            </Tip>
          </AccordionSection>
        </div>
      </div>

      {/* Phase 5 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Phase 5: Requests & Operations</h2>
        <div className="space-y-3">
          <AccordionSection
            title="Seerr"
            port="localhost:5055"
            description="Media request management — lets users request movies and TV shows"
          >
            <Step n={1}>
              <p>Open Seerr at <Code>localhost:5055</Code> and sign in with your Plex account. This creates the admin user and connects Seerr to your Plex library.</p>
            </Step>
            <Step n={2}>
              <p>Connect Sonarr and Radarr — use Quick Setup below or configure manually in Seerr → Settings → Services:</p>
              <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
                <li>Sonarr: <Code>hostname: sonarr, port: 8989</Code></li>
                <li>Radarr: <Code>hostname: radarr, port: 7878</Code></li>
              </ul>
            </Step>
            <QuickSetupSeerr />
            <Step n={3}>
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
            <QuickSetupButton
              label="Recyclarr"
              endpoint="/api/recyclarr/configure"
              description="Auto-configure Recyclarr with TRaSH Guide 1080p profiles for Sonarr (WEB-1080p) and Radarr (Remux + WEB 1080p), then run an initial sync. Requires API keys to be detected first."
              successMessage="Recyclarr configured — TRaSH Guide profiles synced to Sonarr and Radarr"
            />
            <Step n={1}>
              <p>If you prefer to configure manually, edit config files in <Code>config/recyclarr/configs/</Code> with your Sonarr and Radarr API keys and base URLs.</p>
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
              <p>Verify with: <Code>docker logs recyclarr</Code> — Recyclarr runs automatically on its daily schedule.</p>
            </Step>
            <Tip>
              Quick Setup uses the WEB-1080p profile for TV and Remux + WEB 1080p for movies. For 4K/2160p profiles,
              edit the config files manually or run <Code>docker exec recyclarr recyclarr config create -t web-2160p</Code>.
            </Tip>
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

          <AccordionSection
            title="Quality Profiles"
            description="Control download quality and prevent duplicate downloads"
          >
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">What Are Quality Profiles?</h4>
            <p className="mt-1">
              Quality profiles tell Sonarr and Radarr which resolutions and formats to accept when downloading media.
              Each movie or TV series is assigned a profile (e.g. &quot;HD-1080p&quot;, &quot;Any&quot;, &quot;Ultra-HD&quot;).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              When a download is grabbed, it must match one of the qualities allowed in the assigned profile.
              If no releases match, the item stays in the &quot;missing&quot; state until one does.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Why Do Duplicate Downloads Happen?</h4>
            <p className="mt-1">
              Each profile has an <strong>Allow Upgrades</strong> setting. When enabled, Sonarr/Radarr will
              automatically replace an existing file with a higher-quality version — for example, replacing a
              1080p WEBRip with a 1080p BluRay, or a 1080p file with a 4K version.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This means the same movie or episode can be downloaded multiple times as better releases appear.
              The old file is deleted after the upgrade completes, but both downloads consume bandwidth and disk
              space while in progress.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">How to Prevent It</h4>
            <p className="mt-1">
              Go to <a href="/settings" className="text-primary underline">Settings → Quality</a> and turn off
              the <strong>Allow upgrades</strong> toggle for any profile where you want to keep the first
              matching download without replacement.
            </p>
            <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
              <li>
                <strong>Upgrades off</strong> — keeps the first version that matches your profile.
                Recommended if you don&apos;t care about getting the absolute best quality.
              </li>
              <li>
                <strong>Upgrades on</strong> — continues looking for better quality until the cutoff is reached.
                Useful if you want BluRay quality but are happy to watch a WEB release while waiting.
              </li>
            </ul>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Common Profiles</h4>
            <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground space-y-1">
              <li><strong>Any</strong> — accepts all qualities. Will grab the first available release regardless of resolution.</li>
              <li><strong>HD-1080p</strong> — only accepts 1080p content (HDTV, WEB, BluRay).</li>
              <li><strong>Ultra-HD</strong> — only accepts 4K/2160p content.</li>
              <li><strong>HD - 720p/1080p</strong> — accepts both 720p and 1080p, good for limited storage.</li>
            </ul>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Bulk Assignment</h4>
            <p className="mt-1">
              If you want all your movies or TV shows on the same profile, use the
              <strong> Bulk Profile Assignment</strong> section in{' '}
              <a href="/settings" className="text-primary underline">Settings → Quality</a>.
              Select the profile and click &quot;Apply to All&quot; — this updates every item at once
              without having to change them individually in Sonarr or Radarr.
            </p>

            <Tip>
              The &quot;Any&quot; profile is the most common cause of unexpected duplicate downloads.
              If you&apos;re seeing movies downloaded twice, check whether they&apos;re using &quot;Any&quot; with
              upgrades enabled.
            </Tip>
          </AccordionSection>

          <AccordionSection
            title="Logs"
            description="View application and container logs for all services"
          >
            <p>
              The <a href="/logs" className="text-primary underline">Logs page</a> lets you view
              logs from every service in the stack without using the command line.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Services Tab</h4>
            <p className="mt-1">Select any service from the dropdown to view its logs. Two source modes are available:</p>
            <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
              <li>
                <strong>App Logs</strong> — reads the actual log files from <Code>CONFIG_ROOT</Code> (e.g.
                Sonarr&apos;s <Code>sonarr.txt</Code>, Radarr&apos;s <Code>radarr.txt</Code>)
              </li>
              <li>
                <strong>Docker</strong> — shows container stdout/stderr output (useful for services like
                Gluetun, qBittorrent, SABnzbd that don&apos;t write log files)
              </li>
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              A file picker appears when a service has multiple log files (e.g. Recyclarr).
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Deploy Tab</h4>
            <p className="mt-1">
              Browse deploy script log files to review what happened during installation or updates.
            </p>

            <Tip>
              Use the line count selector to load more history (up to 1000 lines). Logs auto-refresh every 5 seconds.
            </Tip>
          </AccordionSection>

          <AccordionSection
            title="Backup & Restore"
            description="Protect your service configurations with backups"
          >
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">What&apos;s Backed Up</h4>
            <p className="mt-1">
              All service configuration directories from <Code>CONFIG_ROOT</Code> — databases, settings,
              API keys, quality profiles, and indexer configs for every service.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Media files (movies, TV shows, downloads), <Code>.env</Code>, Docker images, and the source code
              are <strong>not</strong> included.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Creating Backups</h4>
            <p className="mt-1">Use the web UI or the command line:</p>
            <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
              <li>
                <strong>Web UI:</strong> Settings → Backups → &quot;Back Up Now&quot;
              </li>
              <li>
                <strong>CLI:</strong> <Code>./scripts/backup.sh</Code>
              </li>
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              Backups are stored in <Code>BACKUP_DIR</Code> as timestamped <Code>.tar.gz</Code> archives.
              The CLI script automatically keeps the 7 most recent and deletes older ones.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Restoring</h4>
            <p className="mt-1">Restoring overwrites all current service configurations with the backup contents.</p>
            <ul className="ml-4 mt-1 list-disc text-xs text-muted-foreground">
              <li>
                <strong>Web UI:</strong> Settings → Backups → click the restore icon on a backup
              </li>
              <li>
                <strong>CLI:</strong>
              </li>
            </ul>
            <Pre>{`./scripts/restore.sh ~/.mmc/backups/mars-media-centre-backup-2024-01-15-030000.tar.gz`}</Pre>
            <p className="text-xs text-muted-foreground">
              The restore process stops services, extracts configs, fixes permissions, then restarts everything.
            </p>

            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Automated Backups</h4>
            <p className="mt-1">Add a cron job to run backups on a schedule:</p>
            <Pre>{`# Daily at 3 AM
crontab -e
0 3 * * * /path/to/mmc/scripts/backup.sh`}</Pre>

            <Tip>
              You can download backups from the web UI to save a copy off-server. Consider keeping
              at least one off-site backup for disaster recovery.
            </Tip>
          </AccordionSection>
        </div>
      </div>

      {/* VPN Kill-Switch */}
      <div>
        <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-success" />
          VPN Kill-Switch Protection
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Download clients cannot bypass the VPN</CardTitle>
          </CardHeader>
          <p className="text-sm text-muted-foreground">
            qBittorrent and SABnzbd are configured with <Code>network_mode: service:gluetun</Code> in Docker Compose.
            This means they share Gluetun&apos;s network stack entirely — they have no independent network interface
            and all traffic must traverse the VPN tunnel.
          </p>
          <ul className="ml-4 mt-3 list-disc space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">No independent networking</strong> — the download clients have
              no direct access to your host network. Every packet in or out goes through Gluetun.
            </li>
            <li>
              <strong className="text-foreground">Startup dependency</strong> — qBittorrent and SABnzbd will not
              start until Gluetun&apos;s healthcheck confirms the VPN is connected.
            </li>
            <li>
              <strong className="text-foreground">Automatic kill-switch</strong> — if the VPN connection drops,
              the download clients lose all network connectivity immediately. There is no fallback path to
              the internet.
            </li>
            <li>
              <strong className="text-foreground">No exposed ports</strong> — the download client containers
              have no <Code>ports:</Code> section of their own. Their web UIs and torrent ports are published
              on the Gluetun container, which is the only way to expose ports when sharing a network stack.
            </li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            This is the most secure configuration possible with Docker — there is no bypass route even if the
            VPN tunnel interface goes down.
          </p>
        </Card>
      </div>
    </div>
  );
}
