import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  getNetworkNamespaceInode,
  getPublicIpFromContainer,
  getHostPublicIp,
  getRoutes,
  getDnsResolvers,
} from '@/lib/docker';
import { lookupCountry } from '@/lib/api/geolocation';
import { getPublicIP as getGluetunPublicIp } from '@/lib/api/gluetun';

export const dynamic = 'force-dynamic';

const VPN_CLIENTS = ['qbittorrent', 'sabnzbd'] as const;
type Client = (typeof VPN_CLIENTS)[number];

export interface RoutingEvidence {
  cachedAt: string;
  namespace: {
    gluetun: string | null;
    clients: Record<Client, { inode: string | null; matchesGluetun: boolean }>;
    verdict: 'pass' | 'fail' | 'unknown';
  };
  publicIp: {
    gluetun: { ip: string | null; country: string | null };
    clients: Record<Client, { ip: string | null; matchesGluetun: boolean }>;
    host: { ip: string | null; country: string | null };
    verdict: 'pass' | 'fail' | 'unknown';
  };
  routes: Record<Client, { entries: string[]; tunnelOnly: boolean }>;
  dns: Record<Client, { resolvers: string[]; verdict: 'pass' | 'fail' | 'unknown' }>;
}

// Server-side cache. Probes do real docker exec + HTTPS calls — running them
// on every poll would be wasteful. 60 s matches the ask in the design review.
const CACHE_TTL_MS = 60_000;
let cached: { data: RoutingEvidence; at: number } | null = null;

// Tunnel/private network ranges that indicate the resolver is "inside" the
// VPN path rather than a host/ISP server. Conservative — RFC1918 + CGNAT.
function isTunnelDns(ip: string): boolean {
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true; // common Docker DNS — still inside the netns
  if (/^127\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(ip)) return true; // CGNAT, used by Mullvad et al
  return false;
}

async function probe(): Promise<RoutingEvidence> {
  const [
    gluetunInode,
    qbitInode,
    sabInode,
    gluetunPublicIp,
    qbitPublicIp,
    sabPublicIp,
    hostPublicIp,
    qbitRoutes,
    sabRoutes,
    qbitDns,
    sabDns,
  ] = await Promise.all([
    getNetworkNamespaceInode('gluetun'),
    getNetworkNamespaceInode('qbittorrent'),
    getNetworkNamespaceInode('sabnzbd'),
    getGluetunPublicIp().then((r) => r.public_ip || null).catch(() => null),
    getPublicIpFromContainer('qbittorrent'),
    getPublicIpFromContainer('sabnzbd'),
    getHostPublicIp(),
    getRoutes('qbittorrent'),
    getRoutes('sabnzbd'),
    getDnsResolvers('qbittorrent'),
    getDnsResolvers('sabnzbd'),
  ]);

  // Geo-enrich the headline IPs only. Skip per-client lookups — they should
  // match gluetun's anyway and the extra calls add latency.
  const [gluetunCountry, hostCountry] = await Promise.all([
    gluetunPublicIp ? lookupCountry(gluetunPublicIp) : Promise.resolve(null),
    hostPublicIp ? lookupCountry(hostPublicIp) : Promise.resolve(null),
  ]);

  // Namespace verdict
  const namespaceInodes = { qbittorrent: qbitInode, sabnzbd: sabInode };
  const nsMatches = Object.fromEntries(
    Object.entries(namespaceInodes).map(([k, v]) => [
      k,
      { inode: v, matchesGluetun: !!gluetunInode && v === gluetunInode },
    ]),
  ) as Record<Client, { inode: string | null; matchesGluetun: boolean }>;
  const nsAllKnown = gluetunInode && qbitInode && sabInode;
  const nsAllMatch = nsAllKnown && qbitInode === gluetunInode && sabInode === gluetunInode;
  const nsVerdict: 'pass' | 'fail' | 'unknown' = !nsAllKnown ? 'unknown' : nsAllMatch ? 'pass' : 'fail';

  // Public-IP verdict
  const clientIps = { qbittorrent: qbitPublicIp, sabnzbd: sabPublicIp };
  const ipMatches = Object.fromEntries(
    Object.entries(clientIps).map(([k, v]) => [
      k,
      { ip: v, matchesGluetun: !!gluetunPublicIp && v === gluetunPublicIp },
    ]),
  ) as Record<Client, { ip: string | null; matchesGluetun: boolean }>;
  const ipAllKnown = gluetunPublicIp && qbitPublicIp && sabPublicIp;
  const ipAllMatch = ipAllKnown && qbitPublicIp === gluetunPublicIp && sabPublicIp === gluetunPublicIp;
  const ipVerdict: 'pass' | 'fail' | 'unknown' = !ipAllKnown ? 'unknown' : ipAllMatch ? 'pass' : 'fail';

  // Routes: only tunnel device (wg0/tun0) on the default route is fine.
  const tunnelOnly = (entries: string[]): boolean => {
    const defaults = entries.filter((e) => e.startsWith('default'));
    return defaults.length > 0 && defaults.every((e) => /dev (wg\d+|tun\d+)/.test(e));
  };

  // DNS: every resolver should be a private/tunnel address.
  const dnsVerdict = (resolvers: string[]): 'pass' | 'fail' | 'unknown' => {
    if (resolvers.length === 0) return 'unknown';
    return resolvers.every(isTunnelDns) ? 'pass' : 'fail';
  };

  return {
    cachedAt: new Date().toISOString(),
    namespace: {
      gluetun: gluetunInode,
      clients: nsMatches,
      verdict: nsVerdict,
    },
    publicIp: {
      gluetun: { ip: gluetunPublicIp, country: gluetunCountry },
      clients: ipMatches,
      host: { ip: hostPublicIp, country: hostCountry },
      verdict: ipVerdict,
    },
    routes: {
      qbittorrent: { entries: qbitRoutes, tunnelOnly: tunnelOnly(qbitRoutes) },
      sabnzbd: { entries: sabRoutes, tunnelOnly: tunnelOnly(sabRoutes) },
    },
    dns: {
      qbittorrent: { resolvers: qbitDns, verdict: dnsVerdict(qbitDns) },
      sabnzbd: { resolvers: sabDns, verdict: dnsVerdict(sabDns) },
    },
  };
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const now = Date.now();

  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const data = await probe();
    cached = { data, at: now };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to gather routing evidence', details: String(err) },
      { status: 500 },
    );
  }
}
