'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Shield, ShieldAlert, ShieldCheck, ExternalLink, Info,
  Play, Square, RotateCcw, ScrollText, Loader2, RefreshCw,
  Power,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { LogViewerModal } from '@/components/common/LogViewerModal';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import { toast } from 'sonner';
import type { ServiceHealth, VpnStatus, DockerServiceStatus } from '@/lib/types/common';

interface ServiceInfo {
  description: string;
  port?: number;
  path?: string;
  https?: boolean;
  tip?: string;
}

const SERVICE_CATALOG: Record<string, ServiceInfo> = {
  gluetun: { description: 'VPN client — routes all download traffic through WireGuard/OpenVPN' },
  qbittorrent: { description: 'Torrent client — downloads from torrent indexers via VPN', port: 8080, tip: 'Default login — username: admin, password: your QBITTORRENT_PASSWORD from Settings. Change the default password after first login.' },
  sabnzbd: { description: 'Usenet client — downloads from Usenet providers via VPN', port: 8081 },
  prowlarr: { description: 'Indexer manager — manages torrent and Usenet sources for Sonarr/Radarr', port: 9696 },
  sonarr: { description: 'TV show manager — monitors, downloads, and organises TV episodes', port: 8989 },
  radarr: { description: 'Movie manager — monitors, downloads, and organises movies', port: 7878 },
  unpackerr: { description: 'Archive extractor — unpacks completed downloads for import' },
  bazarr: { description: 'Subtitle manager — finds and downloads subtitles automatically', port: 6767 },
  seerr: { description: 'Request manager — lets users browse and request media', port: 5055 },
  recyclarr: { description: 'Quality sync — keeps quality profiles aligned with TRaSH Guides' },
  watchtower: { description: 'Auto-updater — checks for and applies Docker image updates' },
  'media-ui': { description: 'Unified dashboard — this web interface' },
};

interface ServiceGroup {
  label: string;
  services: string[];
}

const SERVICE_GROUPS: ServiceGroup[] = [
  { label: 'VPN Gateway', services: ['gluetun'] },
  { label: 'Download Clients', services: ['qbittorrent', 'sabnzbd'] },
  { label: 'Indexer & Media Managers', services: ['prowlarr', 'sonarr', 'radarr', 'unpackerr'] },
  { label: 'Media Companions', services: ['bazarr', 'seerr'] },
  { label: 'Operations', services: ['recyclarr', 'watchtower'] },
  { label: 'Web UI', services: ['media-ui'] },
];

function getDockerBadge(svc: DockerServiceStatus) {
  if (svc.state === 'running' && svc.health === 'healthy') return <Badge variant="success">Healthy</Badge>;
  if (svc.state === 'running' && svc.health === 'none') return <Badge variant="success">Running</Badge>;
  if (svc.state === 'running' && svc.health === 'starting') return <Badge variant="warning">Starting</Badge>;
  if (svc.state === 'running' && svc.health === 'unhealthy') return <Badge variant="danger">Unhealthy</Badge>;
  if (svc.state === 'exited') return <Badge variant="danger">Stopped</Badge>;
  if (svc.state === 'restarting') return <Badge variant="warning">Restarting</Badge>;
  return <Badge variant="outline">{svc.state}</Badge>;
}

function getApiBadge(health: ServiceHealth | undefined) {
  if (!health) return null;
  return health.status === 'online'
    ? <Badge variant="outline" className="text-success border-success/30">Online</Badge>
    : <Badge variant="outline" className="text-danger border-danger/30">Offline</Badge>;
}

export default function SystemPage() {
  const { data: vpnData } = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetchApi<VpnStatus>('/api/vpn'),
    refetchInterval: POLLING.VPN,
    staleTime: STALE_TIME.VPN,
  });

  const { data: healthData } = useQuery<{ services: ServiceHealth[] }>({
    queryKey: ['health'],
    queryFn: () => fetchApi<{ services: ServiceHealth[] }>('/api/health'),
    refetchInterval: POLLING.HEALTH,
    staleTime: STALE_TIME.HEALTH,
  });

  const [dockerServices, setDockerServices] = useState<DockerServiceStatus[]>([]);
  const [dockerLoading, setDockerLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<Record<string, string>>({});
  const [logService, setLogService] = useState<string | null>(null);

  const loadDocker = useCallback(async () => {
    try {
      const res = await fetch('/api/services');
      if (res.ok) {
        const data = await res.json();
        setDockerServices(data.services);
      }
    } catch {
      // silently fail
    } finally {
      setDockerLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocker();
    const interval = setInterval(loadDocker, POLLING.SERVICES);
    return () => clearInterval(interval);
  }, [loadDocker]);

  const performAction = async (service: string, action: 'restart' | 'stop' | 'start') => {
    setActionInProgress((prev) => ({ ...prev, [service]: action }));
    try {
      const res = await fetch(`/api/services/${service}/${action}`, { method: 'POST' });
      if (res.ok) {
        toast.success(`${service} ${action === 'restart' ? 'restarted' : action === 'stop' ? 'stopped' : 'started'}`);
        setTimeout(loadDocker, 2000);
      } else {
        const data = await res.json();
        toast.error(data.details || data.error || `Failed to ${action} ${service}`);
      }
    } catch {
      // If restarting media-ui, the connection drops — that's expected
      if (service === 'media-ui' && action === 'restart') {
        toast.info('Web UI is restarting — page will reload shortly');
        const poll = setInterval(async () => {
          try {
            const healthRes = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
            if (healthRes.ok) {
              clearInterval(poll);
              window.location.reload();
            }
          } catch {
            // expected during restart
          }
        }, 3000);
        setTimeout(() => clearInterval(poll), 60000);
        return;
      }
      toast.error(`Failed to ${action} ${service} — connection lost`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[service];
        return next;
      });
    }
  };

  const [startAllLoading, setStartAllLoading] = useState(false);
  const [stopAllLoading, setStopAllLoading] = useState(false);
  const [stopSelfLoading, setStopSelfLoading] = useState(false);

  const stopAll = async () => {
    setStopAllLoading(true);
    try {
      const res = await fetch('/api/services/stop-all', { method: 'POST' });
      if (res.ok || res.status === 207) {
        const data = await res.json();
        if (data.status === 'partial') {
          toast.warning(`Some services failed to stop: ${data.error}`);
        } else {
          toast.success('All services stopped (except Media UI)');
        }
        loadDocker();
      } else {
        toast.error('Failed to stop services');
      }
    } catch {
      toast.error('Failed to stop services — connection lost');
    } finally {
      setStopAllLoading(false);
    }
  };

  const startAll = async () => {
    setStartAllLoading(true);
    try {
      const res = await fetch('/api/services/start-all', { method: 'POST' });
      if (res.ok || res.status === 207) {
        const data = await res.json();
        if (data.status === 'partial') {
          toast.warning(`Some services failed to start: ${data.error}`);
        } else {
          toast.success('All services started');
        }
        loadDocker();
      } else {
        toast.error('Failed to start services');
      }
    } catch {
      toast.error('Failed to start services — connection lost');
    } finally {
      setStartAllLoading(false);
    }
  };

  const stopSelf = async () => {
    try {
      const res = await fetch('/api/services/stop-self', { method: 'POST' });
      if (res.ok) {
        toast.info('Media UI is shutting down — this page will become unreachable');
        setStopSelfLoading(true);
      } else {
        toast.error('Failed to stop Media UI');
      }
    } catch {
      toast.error('Failed to stop Media UI — connection lost');
    }
  };

  const healthMap = new Map(
    healthData?.services?.map((h) => [h.name.toLowerCase(), h]) ?? []
  );
  const dockerMap = new Map(
    dockerServices.map((s) => [s.service, s])
  );

  function renderServiceRow(serviceName: string) {
    const svc = dockerMap.get(serviceName);
    const info = SERVICE_CATALOG[serviceName];
    const health = healthMap.get(serviceName);
    const action = actionInProgress[serviceName];
    const isRunning = svc?.state === 'running';
    const isSelf = serviceName === 'media-ui';

    return (
      <div
        key={serviceName}
        className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{serviceName}</p>
            {svc && getDockerBadge(svc)}
            {getApiBadge(health)}
            {health?.version && (
              <span className="text-[10px] text-muted-foreground">{health.version}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {info?.description}
          </p>
        </div>

        <div className="ml-4 flex items-center gap-1.5">
          {info?.tip && (
            <span
              className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={info.tip}
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          )}
          {info?.port && (
            <a
              href={`${info.https ? 'https' : 'http'}://localhost:${info.port}${info.path || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={`Open ${serviceName}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {svc && (
            <>
              <button
                onClick={() => setLogService(serviceName)}
                className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="View logs"
              >
                <ScrollText className="h-3.5 w-3.5" />
              </button>
              {isRunning ? (
                <>
                  <button
                    onClick={() => performAction(serviceName, 'restart')}
                    disabled={!!action}
                    className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="Restart"
                  >
                    {action === 'restart' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {!isSelf && (
                    <button
                      onClick={() => performAction(serviceName, 'stop')}
                      disabled={!!action}
                      className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-danger disabled:opacity-50"
                      title="Stop"
                    >
                      {action === 'stop' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => performAction(serviceName, 'start')}
                  disabled={!!action}
                  className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-success disabled:opacity-50"
                  title="Start"
                >
                  {action === 'start' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6" />
        <h1 className="text-2xl font-bold">System</h1>
      </div>

      {/* VPN Status */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              {vpnData?.status === 'connected' ? <ShieldCheck className="h-4 w-4 text-success" />
                : vpnData?.status === 'connecting' ? <Loader2 className="h-4 w-4 animate-spin text-warning" />
                : vpnData?.status === 'error' ? <ShieldAlert className="h-4 w-4 text-danger" />
                : !vpnData ? <Shield className="h-4 w-4 text-muted-foreground" />
                : <ShieldAlert className="h-4 w-4 text-danger" />}
              VPN Status
            </div>
          </CardTitle>
          <Badge variant={
            vpnData?.status === 'connected' ? 'success'
              : vpnData?.status === 'connecting' ? 'warning'
              : !vpnData ? 'outline'
              : 'danger'
          }>
            {vpnData?.status === 'connected' ? 'Connected'
              : vpnData?.status === 'connecting' ? 'Connecting'
              : vpnData?.status === 'error' ? 'Error'
              : !vpnData ? 'Unknown'
              : 'Disconnected'}
          </Badge>
        </CardHeader>
        {vpnData?.statusMessage && vpnData.status !== 'connected' && (
          <p className="mb-3 text-xs text-muted-foreground">{vpnData.statusMessage}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Public IP</p>
            {!vpnData ? (
              <Skeleton className="mt-1 h-4 w-28" />
            ) : (
              <p className="font-mono text-sm">{vpnData.ip || '—'}</p>
            )}
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Country</p>
            {!vpnData ? (
              <Skeleton className="mt-1 h-4 w-24" />
            ) : (
              <p className="text-sm">{vpnData.country || '—'}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Unified Services Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Services
            </div>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadDocker}
              className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={startAll}
              disabled={startAllLoading}
              className="flex items-center gap-1.5 rounded-md border border-success px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success hover:text-white disabled:opacity-50"
            >
              {startAllLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Start Services
            </button>
            <button
              onClick={stopAll}
              disabled={stopAllLoading}
              className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-50"
            >
              {stopAllLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              Stop Services
            </button>
            <button
              onClick={stopSelf}
              disabled={stopSelfLoading}
              className="flex items-center gap-1.5 rounded-md border border-warning px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning hover:text-white disabled:opacity-50"
              title="Stop the Media UI service — this page will become unreachable"
            >
              {stopSelfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              Stop UI
            </button>
          </div>
        </CardHeader>

        {dockerLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {SERVICE_GROUPS.map((group) => {
              const hasAny = group.services.some((s) => dockerMap.has(s));
              if (!hasAny) return null;
              return (
                <div key={group.label}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {group.services.map((s) => dockerMap.has(s) ? renderServiceRow(s) : null)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <LogViewerModal
        open={!!logService}
        onClose={() => setLogService(null)}
        serviceName={logService || ''}
      />
    </div>
  );
}
