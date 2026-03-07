'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, CheckCircle2, XCircle, Loader2, Moon, Sun, FolderOpen, Save, RotateCcw } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { toast } from 'sonner';

interface ServiceConfig {
  name: string;
  envUrl: string;
  envKey: string;
  testEndpoint: string;
  description: string;
}

const services: ServiceConfig[] = [
  { name: 'Sonarr', envUrl: 'SONARR_URL', envKey: 'SONARR_API_KEY', testEndpoint: '/api/health', description: 'TV show management' },
  { name: 'Radarr', envUrl: 'RADARR_URL', envKey: 'RADARR_API_KEY', testEndpoint: '/api/health', description: 'Movie management' },
  { name: 'Prowlarr', envUrl: 'PROWLARR_URL', envKey: 'PROWLARR_API_KEY', testEndpoint: '/api/health', description: 'Indexer management' },
  { name: 'qBittorrent', envUrl: 'QBITTORRENT_URL', envKey: 'QBITTORRENT_PASSWORD', testEndpoint: '/api/health', description: 'Torrent client' },
  { name: 'SABnzbd', envUrl: 'SABNZBD_URL', envKey: 'SABNZBD_API_KEY', testEndpoint: '/api/health', description: 'Usenet client' },
  { name: 'Plex', envUrl: 'PLEX_URL', envKey: 'PLEX_TOKEN', testEndpoint: '/api/health', description: 'Media server' },
  { name: 'Seerr', envUrl: 'SEERR_URL', envKey: 'SEERR_API_KEY', testEndpoint: '/api/health', description: 'Request management' },
  { name: 'Tautulli', envUrl: 'TAUTULLI_URL', envKey: 'TAUTULLI_API_KEY', testEndpoint: '/api/health', description: 'Plex monitoring' },
  { name: 'Gluetun', envUrl: 'GLUETUN_URL', envKey: '', testEndpoint: '/api/vpn', description: 'VPN gateway' },
];

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface StoragePaths {
  DATA_ROOT: string;
  CONFIG_ROOT: string;
  BACKUP_DIR: string;
}

const PATH_LABELS: Record<keyof StoragePaths, string> = {
  DATA_ROOT: 'Data Root',
  CONFIG_ROOT: 'Config Root',
  BACKUP_DIR: 'Backup Directory',
};

export default function SettingsPage() {
  const [testResults, setTestResults] = useState<Record<string, TestStatus>>({});
  const [darkMode, setDarkMode] = useState(true);

  // Storage paths state
  const [paths, setPaths] = useState<StoragePaths>({ DATA_ROOT: '', CONFIG_ROOT: '', BACKUP_DIR: '' });
  const [savedPaths, setSavedPaths] = useState<StoragePaths>({ DATA_ROOT: '', CONFIG_ROOT: '', BACKUP_DIR: '' });
  const [pathsLoading, setPathsLoading] = useState(true);
  const [pathsSaving, setPathsSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const loadPaths = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/paths');
      if (res.ok) {
        const data = await res.json();
        setPaths(data);
        setSavedPaths(data);
      }
    } catch {
      // paths not available (e.g. running outside container)
    } finally {
      setPathsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPaths();
  }, [loadPaths]);

  const testConnection = async (service: ServiceConfig) => {
    setTestResults((prev) => ({ ...prev, [service.name]: 'testing' }));
    try {
      const res = await fetch(service.testEndpoint);
      const data = await res.json();
      const isHealthy = data.services?.some(
        (s: { name: string; status: string }) =>
          s.name.toLowerCase() === service.name.toLowerCase() && s.status === 'online'
      ) ?? (data.connected !== undefined ? data.connected : res.ok);
      setTestResults((prev) => ({ ...prev, [service.name]: isHealthy ? 'success' : 'error' }));
    } catch {
      setTestResults((prev) => ({ ...prev, [service.name]: 'error' }));
    }
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark', !darkMode);
  };

  const savePaths = async () => {
    setPathsSaving(true);
    try {
      const res = await fetch('/api/settings/paths', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paths),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save paths');
        return;
      }
      setPaths(data);
      setSavedPaths(data);
      toast.success('Storage paths saved');
    } catch {
      toast.error('Failed to save paths');
    } finally {
      setPathsSaving(false);
    }
  };

  const restartStack = async () => {
    setConfirmRestart(false);
    setRestarting(true);
    try {
      const res = await fetch('/api/settings/restart', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to trigger restart');
        setRestarting(false);
        return;
      }
      toast.info('Restarting stack...');
      // Poll /api/health until it comes back (container will recycle)
      const maxWait = 120_000; // 2 minutes
      const interval = 2_000;
      const start = Date.now();
      // Wait a moment for the restart to begin
      await new Promise((r) => setTimeout(r, 3000));
      const poll = async () => {
        while (Date.now() - start < maxWait) {
          try {
            const healthRes = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
            if (healthRes.ok) {
              setRestarting(false);
              toast.success('Stack restarted successfully');
              return;
            }
          } catch {
            // expected while restarting
          }
          await new Promise((r) => setTimeout(r, interval));
        }
        setRestarting(false);
        toast.error('Restart timed out — check container logs');
      };
      poll();
    } catch {
      toast.error('Failed to trigger restart');
      setRestarting(false);
    }
  };

  const pathsChanged = paths.DATA_ROOT !== savedPaths.DATA_ROOT ||
    paths.CONFIG_ROOT !== savedPaths.CONFIG_ROOT ||
    paths.BACKUP_DIR !== savedPaths.BACKUP_DIR;

  return (
    <>
      {/* Fullscreen restart overlay */}
      {restarting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg font-medium">Restarting stack...</p>
          <p className="mt-1 text-sm text-muted-foreground">Waiting for services to come back online</p>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {/* Theme */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Toggle between dark and light themes</p>
            </div>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {darkMode ? 'Dark' : 'Light'}
            </button>
          </div>
        </Card>

        {/* Storage Paths */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Storage Paths
            </CardTitle>
          </CardHeader>
          <p className="mb-4 text-xs text-muted-foreground">
            Configure where media data, service configs, and backups are stored.
            Paths must be absolute. Changes require a stack restart to take effect.
          </p>
          {pathsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {(Object.keys(PATH_LABELS) as (keyof StoragePaths)[]).map((key) => (
                  <div key={key}>
                    <label htmlFor={key} className="mb-1 block text-sm font-medium">
                      {PATH_LABELS[key]}
                    </label>
                    <input
                      id={key}
                      type="text"
                      value={paths[key]}
                      onChange={(e) => setPaths((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={`/home/user/.mmc/${key === 'DATA_ROOT' ? 'data' : key === 'CONFIG_ROOT' ? 'config' : 'backups'}`}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={savePaths}
                  disabled={pathsSaving || !pathsChanged}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {pathsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Paths
                </button>
                {confirmRestart ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Restart all containers?</span>
                    <button
                      onClick={restartStack}
                      className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmRestart(false)}
                      className="rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRestart(true)}
                    disabled={restarting}
                    className="flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restart Stack
                  </button>
                )}
              </div>
            </>
          )}
        </Card>

        {/* Service Connections */}
        <Card>
          <CardHeader>
            <CardTitle>Service Connections</CardTitle>
          </CardHeader>
          <p className="mb-4 text-xs text-muted-foreground">
            Connection details are configured via environment variables in docker-compose.yml.
            Use the test button to verify each service is reachable.
          </p>
          <div className="space-y-3">
            {services.map((service) => {
              const status = testResults[service.name] || 'idle';
              return (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{service.name}</p>
                      <Badge variant="outline">{service.description}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{service.envUrl}</span>
                      {service.envKey && (
                        <span> / <span className="font-mono">{service.envKey}</span></span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'success' && <CheckCircle2 className="h-4 w-4 text-success" />}
                    {status === 'error' && <XCircle className="h-4 w-4 text-danger" />}
                    {status === 'testing' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <button
                      onClick={() => testConnection(service)}
                      disabled={status === 'testing'}
                      className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      Test
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              This UI manages display and status monitoring only. For advanced service configuration,
              use each service&apos;s native web UI (accessible via System &gt; Quick Links).
            </p>
            <p>
              To update API keys or URLs, edit the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">docker-compose.yml</code> environment
              variables and recreate the container:
            </p>
            <pre className="rounded-md bg-muted p-3 text-xs">
              docker compose up -d media-ui
            </pre>
          </div>
        </Card>
      </div>
    </>
  );
}
