'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Shield, ShieldAlert, ExternalLink, HardDrive } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import type { ServiceHealth, VpnStatus } from '@/lib/types/common';

const serviceLinks: Record<string, { port: number; path?: string }> = {
  Sonarr: { port: 8989 },
  Radarr: { port: 7878 },
  Prowlarr: { port: 9696 },
  qBittorrent: { port: 8080 },
  SABnzbd: { port: 8081 },
  Plex: { port: 32400, path: '/web' },
  Seerr: { port: 5055 },
  Bazarr: { port: 6767 },
  Tautulli: { port: 8181 },
};

export default function SystemPage() {
  const { data: healthData, isLoading: healthLoading } = useQuery<{ services: ServiceHealth[] }>({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then(r => r.json()),
    refetchInterval: POLLING.HEALTH,
    staleTime: STALE_TIME.HEALTH,
  });

  const { data: vpnData } = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetch('/api/vpn').then(r => r.json()),
    refetchInterval: POLLING.VPN,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6" />
        <h1 className="text-2xl font-bold">System</h1>
      </div>

      {/* VPN Panel */}
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

      {/* Service Health Grid */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Service Health
            </div>
          </CardTitle>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {healthLoading ? (
            Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))
          ) : (
            healthData?.services?.map((service) => {
              const link = serviceLinks[service.name];
              return (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        service.status === 'online' ? 'bg-success' : 'bg-danger'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">{service.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {service.status === 'online' ? service.version || 'Running' : 'Offline'}
                      </p>
                    </div>
                  </div>
                  {link && (
                    <a
                      href={`http://localhost:${link.port}${link.path || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={`Open ${service.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(serviceLinks).map(([name, { port, path }]) => (
            <a
              key={name}
              href={`http://localhost:${port}${path || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              {name}
              <span className="ml-auto text-xs text-muted-foreground">:{port}</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
