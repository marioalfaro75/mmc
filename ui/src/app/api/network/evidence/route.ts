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
import { classifyEgress, rollUpEgressVerdict } from '@/lib/egress-verdict';

export const dynamic = 'force-dynamic';

// Every container that shares gluetun's network namespace. flaresolverr is
// here because Prowlarr's Cloudflare challenges must exit via the VPN — a
// direct-from-host solve would expose the real IP to every tracker queried.
const VPN_CLIENTS = ['qbittorrent', 'sabnzbd', 'flaresolverr'] as const;
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
    clients: Record<Client, {
      ip: string | null;
      matchesGluetun: boolean;
      /** Shares gluetun's netns, so egress is identical by construction —
       *  true even when the in-container IP probe couldn't run. */
      namespaceConfirmed: boolean;
    }>;
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
  const [gluetunInode, gluetunPublicIp, hostPublicIp] = await Promise.all([
    getNetworkNamespaceInode('gluetun'),
    getGluetunPublicIp().then((r) => r.public_ip || null).catch(() => null),
    getHostPublicIp(),
  ]);

  // Probe every VPN-namespaced client in parallel. Data-driven over
  // VPN_CLIENTS so adding a service needs only that const array updated,
  // not another four destructured bindings and four verdict operands.
  const probes = await Promise.all(
    VPN_CLIENTS.map(async (client) => {
      const [inode, publicIp, routes, dns] = await Promise.all([
        getNetworkNamespaceInode(client),
        getPublicIpFromContainer(client),
        getRoutes(client),
        getDnsResolvers(client),
      ]);
      return { client, inode, publicIp, routes, dns };
    }),
  );

  // Geo-enrich the headline IPs only. Skip per-client lookups — they should
  // match gluetun's anyway and the extra calls add latency.
  const [gluetunCountry, hostCountry] = await Promise.all([
    gluetunPublicIp ? lookupCountry(gluetunPublicIp) : Promise.resolve(null),
    hostPublicIp ? lookupCountry(hostPublicIp) : Promise.resolve(null),
  ]);

  // Namespace verdict — every client must share gluetun's netns inode.
  const nsMatches = Object.fromEntries(
    probes.map((p) => [
      p.client,
      { inode: p.inode, matchesGluetun: !!gluetunInode && p.inode === gluetunInode },
    ]),
  ) as Record<Client, { inode: string | null; matchesGluetun: boolean }>;
  const nsAllKnown = !!gluetunInode && probes.every((p) => !!p.inode);
  const nsAllMatch = nsAllKnown && probes.every((p) => p.inode === gluetunInode);
  const nsVerdict: 'pass' | 'fail' | 'unknown' = !nsAllKnown ? 'unknown' : nsAllMatch ? 'pass' : 'fail';

  // Public-IP verdict. Three states per client, NOT two — see
  // lib/egress-verdict.ts for why conflating "could not probe" with
  // "leaking" is actively harmful.
  const tunnel = { ip: gluetunPublicIp, inode: gluetunInode };
  const egressStates = probes.map((p) =>
    classifyEgress({ ip: p.publicIp, inode: p.inode }, tunnel),
  );
  const ipMatches = Object.fromEntries(
    probes.map((p, i) => [
      p.client,
      {
        ip: p.publicIp,
        matchesGluetun: egressStates[i] === 'match',
        namespaceConfirmed: egressStates[i] === 'namespace',
      },
    ]),
  ) as Record<Client, { ip: string | null; matchesGluetun: boolean; namespaceConfirmed: boolean }>;
  const ipVerdict = rollUpEgressVerdict(egressStates);

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
    routes: Object.fromEntries(
      probes.map((p) => [p.client, { entries: p.routes, tunnelOnly: tunnelOnly(p.routes) }]),
    ) as Record<Client, { entries: string[]; tunnelOnly: boolean }>,
    dns: Object.fromEntries(
      probes.map((p) => [p.client, { resolvers: p.dns, verdict: dnsVerdict(p.dns) }]),
    ) as Record<Client, { resolvers: string[]; verdict: 'pass' | 'fail' | 'unknown' }>,
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
