'use client';

import {
  Globe,
  Shield,
  ShieldCheck,
  ShieldX,
  HardDrive,
  Download,
  ArrowDown,
  ArrowRight,
  Server,
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import type { NetworkStats, ServiceNetIO } from '@/lib/types/common';

const VPN_SERVICES = new Set(['gluetun', 'qbittorrent', 'sabnzbd']);

interface Props {
  data: NetworkStats;
  tunnelRate: { rx: number; tx: number } | null;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return `${parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTotalBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function ServiceNode({ name, io }: { name: string; io?: ServiceNetIO }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-3 min-w-[100px]">
      <Server className="h-5 w-5 text-muted-foreground" />
      <span className="text-xs font-medium">{name}</span>
      {io && (
        <div className="text-[10px] text-muted-foreground text-center">
          <span className="text-success">{io.rx}</span>
          {' / '}
          <span className="text-primary">{io.tx}</span>
        </div>
      )}
    </div>
  );
}

export function NetworkTopology({ data, tunnelRate }: Props) {
  const vpnServices = data.services.filter(s => VPN_SERVICES.has(s.name));
  const directServices = data.services.filter(s => !VPN_SERVICES.has(s.name));

  return (
    <div className="space-y-6">
      {/* VPN Path */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-muted-foreground mb-1">VPN-Routed Traffic</h3>
        <p className="text-xs text-muted-foreground mb-4">Download clients route all traffic through the encrypted VPN tunnel for privacy.</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4 sm:justify-center">
          {/* Internet */}
          <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-3 min-w-[100px]">
            <Globe className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium">Internet</span>
            {data.vpn.ip && (
              <span className="text-[10px] font-mono text-muted-foreground">{data.vpn.ip}</span>
            )}
            {data.vpn.country && (
              <span className="text-[10px] text-muted-foreground">{data.vpn.country}</span>
            )}
          </div>

          {/* Arrow + tunnel rate */}
          <div className="flex flex-col items-center gap-0.5">
            <ArrowRight className="hidden sm:block h-5 w-5 text-muted-foreground" />
            <ArrowDown className="sm:hidden h-5 w-5 text-muted-foreground" />
            {tunnelRate && (
              <div className="text-[10px] text-muted-foreground text-center">
                <div className="text-success">{formatRate(tunnelRate.rx)}</div>
                <div className="text-primary">{formatRate(tunnelRate.tx)}</div>
              </div>
            )}
          </div>

          {/* VPN Tunnel */}
          <div className="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-3 min-w-[120px]"
            style={{ borderColor: data.vpn.connected ? 'var(--success)' : 'var(--danger)' }}
          >
            {data.vpn.connected ? (
              <ShieldCheck className="h-6 w-6 text-success" />
            ) : (
              <ShieldX className="h-6 w-6 text-danger" />
            )}
            <span className="text-xs font-medium">
              {data.tunnel?.interface === 'wg0' ? 'WireGuard' : 'VPN'} Tunnel
            </span>
            <Badge variant={data.vpn.connected ? 'success' : 'danger'}>
              {data.vpn.connected ? 'Connected' : 'Disconnected'}
            </Badge>
            {data.tunnel && (
              <div className="text-[10px] text-muted-foreground text-center mt-1">
                <div>RX: {formatTotalBytes(data.tunnel.rxBytes)}</div>
                <div>TX: {formatTotalBytes(data.tunnel.txBytes)}</div>
              </div>
            )}
            {data.portForward !== null && data.portForward > 0 && (
              <span className="text-[10px] text-muted-foreground">Port: {data.portForward}</span>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <ArrowRight className="hidden sm:block h-5 w-5 text-muted-foreground" />
            <ArrowDown className="sm:hidden h-5 w-5 text-muted-foreground" />
          </div>

          {/* Gluetun */}
          <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-3 min-w-[100px]">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium">Gluetun</span>
            {vpnServices.find(s => s.name === 'gluetun') && (
              <div className="text-[10px] text-muted-foreground text-center">
                <span className="text-success">{vpnServices.find(s => s.name === 'gluetun')!.rx}</span>
                {' / '}
                <span className="text-primary">{vpnServices.find(s => s.name === 'gluetun')!.tx}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <ArrowRight className="hidden sm:block h-5 w-5 text-muted-foreground" />
            <ArrowDown className="sm:hidden h-5 w-5 text-muted-foreground" />
          </div>

          {/* Download clients */}
          <div className="flex gap-3">
            {vpnServices.filter(s => s.name !== 'gluetun').map(s => (
              <div key={s.name} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-3 min-w-[100px]">
                <Download className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium">{s.name}</span>
                <div className="text-[10px] text-muted-foreground text-center">
                  <span className="text-success">{s.rx}</span>
                  {' / '}
                  <span className="text-primary">{s.tx}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Direct Network */}
      {directServices.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">Docker Internal Network (medianet)</h3>
          <p className="text-xs text-muted-foreground mb-4">These services communicate over the private Docker bridge network and use your regular internet connection. They do not handle downloads directly.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {directServices.map(s => (
              <ServiceNode key={s.name} name={s.name} io={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
