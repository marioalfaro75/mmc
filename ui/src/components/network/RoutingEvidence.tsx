'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Activity,
  ChevronDown,
  ChevronRight,
  Globe,
  Server,
  Loader2,
  RefreshCw,
  Square,
} from 'lucide-react';
import { fetchApi } from '@/lib/utils/fetchApi';
import { toast } from 'sonner';
import type { RoutingEvidence as RoutingEvidenceData } from '@/app/api/network/evidence/route';
import type { NetworkStats } from '@/lib/types/common';

const CLIENTS = ['qbittorrent', 'sabnzbd'] as const;
type Client = (typeof CLIENTS)[number];

// 60 s cache server-side; mirror that on the client.
const POLL_MS = 60 * 1000;
const STALE_MS = 30 * 1000;

interface Props {
  networkData: NetworkStats | undefined;
}

function Verdict({ status }: { status: 'pass' | 'fail' | 'unknown' }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
        <ShieldCheck className="h-3 w-3" /> Pass
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-danger/40 bg-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
        <ShieldX className="h-3 w-3" /> Fail
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <ShieldAlert className="h-3 w-3" /> Unknown
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{children}</code>;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return `${parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Convert Docker's "1.2GB / 345MB" formatted string back into bytes so we
// can compare against the tunnel byte counter.
function parseDockerSize(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMGT]?i?B)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase().replace('I', '');
  const factor: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return n * (factor[unit] ?? 1);
}

export function RoutingEvidence({ networkData }: Props) {
  const queryClient = useQueryClient();
  const [stoppingClient, setStoppingClient] = useState<Client | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const [showCorrelation, setShowCorrelation] = useState(true);
  const lastLeakAlert = useRef<string>('');

  const { data, isLoading, isFetching, refetch } = useQuery<RoutingEvidenceData>({
    queryKey: ['network', 'evidence'],
    queryFn: () => fetchApi<RoutingEvidenceData>('/api/network/evidence'),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  });

  // Loud alerts on a fresh leak. Key on (namespace verdict, ip verdict, dns)
  // so we only toast once per failure transition, not every poll.
  useEffect(() => {
    if (!data) return;
    const failures: string[] = [];
    if (data.namespace.verdict === 'fail') failures.push('network namespace');
    if (data.publicIp.verdict === 'fail') failures.push('public IP');
    for (const c of CLIENTS) {
      if (data.dns[c].verdict === 'fail') failures.push(`${c} DNS`);
    }
    if (failures.length === 0) return;
    const key = failures.join('|');
    if (lastLeakAlert.current === key) return;
    lastLeakAlert.current = key;
    toast.error(
      `VPN leak detected: ${failures.join(', ')}. Stop the affected download client immediately.`,
      { duration: 15000 },
    );
  }, [data]);

  const stopClient = async (client: Client) => {
    if (!confirm(`Stop ${client}? Active downloads will be paused.`)) return;
    setStoppingClient(client);
    try {
      const res = await fetch(`/api/services/${client}/stop`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`${client} stopped`);
      // Re-probe so the evidence card reflects the stopped container.
      queryClient.invalidateQueries({ queryKey: ['network'] });
      queryClient.invalidateQueries({ queryKey: ['network', 'evidence'] });
    } catch (err) {
      toast.error(`Failed to stop ${client}: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setStoppingClient(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Gathering routing evidence…
        </div>
      </div>
    );
  }

  if (!data) return null;

  const anyLeak =
    data.namespace.verdict === 'fail' ||
    data.publicIp.verdict === 'fail' ||
    CLIENTS.some((c) => data.dns[c].verdict === 'fail');

  // Derive live traffic correlation client-side from the existing network
  // payload. tunnelRate is already smoothed in the parent.
  const tunnelTx = networkData?.tunnel?.txBytes ?? null;
  const tunnelRx = networkData?.tunnel?.rxBytes ?? null;
  const qbitNet = networkData?.services?.find((s) => s.name === 'qbittorrent');
  const sabNet = networkData?.services?.find((s) => s.name === 'sabnzbd');
  const clientRxTotal =
    (qbitNet ? parseDockerSize(qbitNet.rx) : 0) + (sabNet ? parseDockerSize(sabNet.rx) : 0);

  return (
    <div
      className={`rounded-xl border bg-card ${anyLeak ? 'border-danger/50' : 'border-border'}`}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          {anyLeak ? (
            <ShieldX className="h-5 w-5 text-danger" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-success" />
          )}
          <h2 className="text-base font-semibold">Routing Evidence</h2>
          <span className="text-xs text-muted-foreground">
            · {new Date(data.cachedAt).toLocaleTimeString()}
          </span>
        </div>
        <button
          type="button"
          onClick={() => fetch('/api/network/evidence?force=1').then(() => refetch())}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          Re-check
        </button>
      </div>

      <div className="space-y-5 p-5">
        {/* Namespace */}
        <Section
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
          title="Network namespace"
          subtitle="Kernel proof that download clients share Gluetun's network stack"
          verdict={data.namespace.verdict}
        >
          <table className="w-full text-xs">
            <tbody>
              <tr>
                <td className="py-1 pr-3 font-medium">Gluetun</td>
                <td className="py-1"><Code>{data.namespace.gluetun ?? 'unknown'}</Code></td>
                <td className="py-1 pl-3 text-muted-foreground">reference</td>
              </tr>
              {CLIENTS.map((c) => {
                const r = data.namespace.clients[c];
                return (
                  <tr key={c}>
                    <td className="py-1 pr-3 font-medium">{c}</td>
                    <td className="py-1"><Code>{r.inode ?? 'unreachable'}</Code></td>
                    <td className="py-1 pl-3">
                      {r.matchesGluetun ? (
                        <span className="text-success">✓ same namespace</span>
                      ) : (
                        <LeakCell label="different namespace" client={c} onStop={stopClient} stopping={stoppingClient === c} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* Public IP */}
        <Section
          icon={<Globe className="h-4 w-4 text-muted-foreground" />}
          title="Public IP egress"
          subtitle="The IP each container's traffic appears as on the public internet"
          verdict={data.publicIp.verdict}
        >
          <table className="w-full text-xs">
            <tbody>
              <tr>
                <td className="py-1 pr-3 font-medium">Gluetun</td>
                <td className="py-1"><Code>{data.publicIp.gluetun.ip ?? 'unknown'}</Code></td>
                <td className="py-1 pl-3 text-muted-foreground">
                  {data.publicIp.gluetun.country ? `${data.publicIp.gluetun.country} · VPN exit` : 'VPN exit'}
                </td>
              </tr>
              {CLIENTS.map((c) => {
                const r = data.publicIp.clients[c];
                return (
                  <tr key={c}>
                    <td className="py-1 pr-3 font-medium">{c}</td>
                    <td className="py-1"><Code>{r.ip ?? 'unreachable'}</Code></td>
                    <td className="py-1 pl-3">
                      {r.matchesGluetun ? (
                        <span className="text-success">✓ matches Gluetun</span>
                      ) : (
                        <LeakCell label="leaking — different exit" client={c} onStop={stopClient} stopping={stoppingClient === c} />
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border/50">
                <td className="py-1 pr-3 pt-2 font-medium text-warning">Host VM</td>
                <td className="py-1 pt-2"><Code>{data.publicIp.host.ip ?? 'unknown'}</Code></td>
                <td className="py-1 pl-3 pt-2 text-warning/80">
                  {data.publicIp.host.country
                    ? `${data.publicIp.host.country} · your real IP (hidden from trackers)`
                    : 'your real IP (hidden from trackers)'}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* DNS */}
        <Section
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          title="DNS resolvers"
          subtitle="DNS queries should resolve via the tunnel, not a host/ISP server"
          verdict={CLIENTS.every((c) => data.dns[c].verdict === 'pass') ? 'pass' : CLIENTS.some((c) => data.dns[c].verdict === 'fail') ? 'fail' : 'unknown'}
        >
          <table className="w-full text-xs">
            <tbody>
              {CLIENTS.map((c) => {
                const r = data.dns[c];
                return (
                  <tr key={c}>
                    <td className="py-1 pr-3 font-medium">{c}</td>
                    <td className="py-1">
                      {r.resolvers.length > 0
                        ? r.resolvers.map((rs, i) => <Code key={i}>{rs}</Code>)
                        : <span className="text-muted-foreground">no resolvers found</span>}
                    </td>
                    <td className="py-1 pl-3">
                      {r.verdict === 'pass' ? (
                        <span className="text-success">✓ tunnel-local</span>
                      ) : r.verdict === 'fail' ? (
                        <LeakCell label="public DNS — possible leak" client={c} onStop={stopClient} stopping={stoppingClient === c} />
                      ) : (
                        <span className="text-muted-foreground">unknown</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* Routes — disclosure */}
        <div>
          <button
            type="button"
            onClick={() => setShowRoutes((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {showRoutes ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Routing tables
            <span className="ml-2 text-[10px]">
              {CLIENTS.every((c) => data.routes[c].tunnelOnly) ? (
                <span className="text-success">all defaults via tunnel</span>
              ) : (
                <span className="text-warning">non-tunnel route present</span>
              )}
            </span>
          </button>
          {showRoutes && (
            <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/30 p-3">
              {CLIENTS.map((c) => (
                <div key={c}>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c}</p>
                  <pre className="overflow-x-auto rounded bg-black/30 p-2 font-mono text-[11px] text-muted-foreground">
                    {data.routes[c].entries.length > 0
                      ? data.routes[c].entries.join('\n')
                      : '(no routes returned — container may not be running)'}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live traffic correlation — disclosure */}
        <div>
          <button
            type="button"
            onClick={() => setShowCorrelation((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {showCorrelation ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Live traffic correlation
            <span className="ml-2 text-[10px] text-muted-foreground">
              tunnel bytes vs. download-client bytes (refreshes with the Network page)
            </span>
          </button>
          {showCorrelation && (
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
              <Stat label="Tunnel rx (session)" value={tunnelRx !== null ? formatBytesTotal(tunnelRx) : '—'} />
              <Stat label="Tunnel tx (session)" value={tunnelTx !== null ? formatBytesTotal(tunnelTx) : '—'} />
              <Stat label="qBit rx (session)" value={qbitNet?.rx ?? '—'} />
              <Stat label="SAB rx (session)" value={sabNet?.rx ?? '—'} />
              <div className="col-span-2 sm:col-span-4 text-[11px] text-muted-foreground">
                {tunnelRx !== null && clientRxTotal > 0
                  ? `Tunnel rx is ${formatRate(tunnelRx)} cumulative; clients have received ${formatRate(clientRxTotal)}. ` +
                    'Within a couple of percent during active downloads = all client bytes flowed through the tunnel.'
                  : 'Start a download to see real-time correlation.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  verdict,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  verdict: 'pass' | 'fail' | 'unknown';
  children: React.ReactNode;
}) {
  return (
    <div className={verdict === 'fail' ? 'rounded-md border border-danger/40 bg-danger/5 p-3' : ''}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <Verdict status={verdict} />
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

function LeakCell({
  label,
  client,
  onStop,
  stopping,
}: {
  label: string;
  client: Client;
  onStop: (c: Client) => void;
  stopping: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-danger">
      ✗ {label}
      <button
        type="button"
        onClick={() => onStop(client)}
        disabled={stopping}
        className="inline-flex items-center gap-1 rounded border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-medium hover:bg-danger/20 disabled:opacity-50"
      >
        {stopping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
        Stop {client}
      </button>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm">{value}</p>
    </div>
  );
}

function formatBytesTotal(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
