'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldX, Globe, ArrowDownUp } from 'lucide-react';
import { NetworkTopology } from '@/components/network/NetworkTopology';
import { Badge } from '@/components/common/Badge';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { NetworkStats } from '@/lib/types/common';

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export default function NetworkPage() {
  const prevRef = useRef<{ rx: number; tx: number; ts: number } | null>(null);
  const rateRef = useRef<{ rx: number; tx: number } | null>(null);

  const { data, isLoading, isError } = useQuery<NetworkStats>({
    queryKey: ['network'],
    queryFn: async () => {
      const stats = await fetchApi<NetworkStats>('/api/network');

      // Calculate tunnel bandwidth rate from successive polls
      if (stats.tunnel && prevRef.current) {
        const elapsed = (stats.timestamp - prevRef.current.ts) / 1000;
        if (elapsed > 0) {
          rateRef.current = {
            rx: Math.max(0, (stats.tunnel.rxBytes - prevRef.current.rx) / elapsed),
            tx: Math.max(0, (stats.tunnel.txBytes - prevRef.current.tx) / elapsed),
          };
        }
      }

      if (stats.tunnel) {
        prevRef.current = {
          rx: stats.tunnel.rxBytes,
          tx: stats.tunnel.txBytes,
          ts: stats.timestamp,
        };
      }

      return stats;
    },
    staleTime: STALE_TIME.NETWORK,
    refetchInterval: POLLING.NETWORK,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Network</h1>
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          Failed to load network stats. Make sure Gluetun is running and Docker socket is accessible.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Network</h1>
        <Badge variant={data.vpn.connected ? 'success' : 'danger'}>
          {data.vpn.connected ? 'VPN Connected' : 'VPN Disconnected'}
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* VPN Status */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            {data.vpn.connected ? (
              <ShieldCheck className="h-4 w-4 text-success" />
            ) : (
              <ShieldX className="h-4 w-4 text-danger" />
            )}
            VPN Status
          </div>
          <p className="text-lg font-semibold">
            {data.vpn.connected ? 'Connected' : 'Disconnected'}
          </p>
          {data.tunnel && (
            <p className="text-xs text-muted-foreground mt-1">
              via {data.tunnel.interface === 'wg0' ? 'WireGuard' : 'OpenVPN'} ({data.tunnel.interface})
            </p>
          )}
        </div>

        {/* Public IP */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Globe className="h-4 w-4" />
            Public IP
          </div>
          <p className="text-lg font-semibold font-mono">
            {data.vpn.ip || '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.vpn.country || 'Unknown location'}
            {data.portForward !== null && data.portForward > 0 && ` · Port ${data.portForward}`}
          </p>
        </div>

        {/* Download bandwidth */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <ArrowDownUp className="h-4 w-4 text-success" />
            Tunnel Bandwidth
          </div>
          {rateRef.current ? (
            <>
              <p className="text-lg font-semibold text-success">
                {formatRate(rateRef.current.rx)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload: {formatRate(rateRef.current.tx)}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-muted-foreground">Measuring...</p>
              <p className="text-xs text-muted-foreground mt-1">Rate available after 2 polls</p>
            </>
          )}
        </div>

        {/* Total transferred */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <ArrowDownUp className="h-4 w-4" />
            Session Total
          </div>
          {data.tunnel ? (
            <>
              <p className="text-lg font-semibold">
                {formatBytes(data.tunnel.rxBytes)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Uploaded: {formatBytes(data.tunnel.txBytes)}
              </p>
            </>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {/* Network topology */}
      <NetworkTopology data={data} tunnelRate={rateRef.current} />
    </div>
  );
}
