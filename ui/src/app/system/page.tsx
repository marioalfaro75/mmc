'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Shield, ShieldAlert, ExternalLink,
  Play, Square, RotateCcw, ScrollText, Loader2, RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { LogViewerModal } from '@/components/common/LogViewerModal';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import { toast } from 'sonner';
import type { ServiceHealth, VpnStatus, DockerServiceStatus } from '@/lib/types/common';

const serviceLinks: Record<string, { port: number; path?: string; https?: boolean }> = {
  sonarr: { port: 8989 },
  radarr: { port: 7878 },
  prowlarr: { port: 9696 },
  qbittorrent: { port: 8080 },
  sabnzbd: { port: 8081 },
  plex: { port: 32400, path: '/web', https: true },
  seerr: { port: 5055 },
  bazarr: { port: 6767 },
  tautulli: { port: 8181 },
};

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
        toast.success(`${service} ${action}ed`);
        setTimeout(loadDocker, 1000);
      } else {
        const data = await res.json();
        toast.error(data.error || `Failed to ${action} ${service}`);
      }
    } catch {
      toast.error(`Failed to ${action} ${service}`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[service];
        return next;
      });
    }
  };

  const restartAll = async () => {
    try {
      const res = await fetch('/api/settings/restart', { method: 'POST' });
      if (res.ok) {
        toast.info('Restarting all services...');
        const poll = setInterval(async () => {
          try {
            const healthRes = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
            if (healthRes.ok) {
              clearInterval(poll);
              toast.success('All services restarted');
              loadDocker();
            }
          } catch {
            // expected during restart
          }
        }, 3000);
        setTimeout(() => clearInterval(poll), 120000);
      }
    } catch {
      toast.error('Failed to restart stack');
    }
  };

  // Build a merged list: use docker services as the base, enrich with health data
  const healthMap = new Map(
    healthData?.services?.map((h) => [h.name.toLowerCase(), h]) ?? []
  );

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
              {vpnData?.connected ? <Shield className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-danger" />}
              VPN Status
            </div>
          </CardTitle>
          <Badge variant={vpnData?.connected ? 'success' : 'danger'}>
            {vpnData?.connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardHeader>
        {vpnData?.connected && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Public IP</p>
              <p className="font-mono text-sm">{vpnData.ip || 'N/A'}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Country</p>
              <p className="text-sm">{vpnData.country || 'N/A'}</p>
            </div>
          </div>
        )}
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
          <div className="flex items-center gap-2">
            <button
              onClick={loadDocker}
              className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={restartAll}
              className="flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger/90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restart All
            </button>
          </div>
        </CardHeader>

        {dockerLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : dockerServices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No services found. Is Docker running?
          </p>
        ) : (
          <div className="space-y-2">
            {dockerServices.map((svc) => {
              const action = actionInProgress[svc.service];
              const isRunning = svc.state === 'running';
              const isSelf = svc.service === 'media-ui';
              const health = healthMap.get(svc.service);
              const link = serviceLinks[svc.service];

              return (
                <div
                  key={svc.service}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{svc.service}</p>
                      {getDockerBadge(svc)}
                      {getApiBadge(health)}
                      {health?.version && (
                        <span className="text-[10px] text-muted-foreground">{health.version}</span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {svc.status}
                    </p>
                  </div>

                  <div className="ml-4 flex items-center gap-1.5">
                    {link && (
                      <a
                        href={`${link.https ? 'https' : 'http'}://localhost:${link.port}${link.path || ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={`Open ${svc.service}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => setLogService(svc.service)}
                      className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="View logs"
                    >
                      <ScrollText className="h-3.5 w-3.5" />
                    </button>
                    {isRunning ? (
                      <>
                        <button
                          onClick={() => performAction(svc.service, 'restart')}
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
                            onClick={() => performAction(svc.service, 'stop')}
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
                        onClick={() => performAction(svc.service, 'start')}
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
