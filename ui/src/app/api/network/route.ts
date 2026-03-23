import { NextResponse } from 'next/server';
import { getVpnStatus, getPublicIP, getPortForward } from '@/lib/api/gluetun';
import { lookupCountry } from '@/lib/api/geolocation';
import { getTunnelStats, getContainerNetworkStats } from '@/lib/docker';
import type { NetworkStats, VpnConnectionStatus } from '@/lib/types/common';
import { requireAdmin } from '@/lib/auth';

const MONITORED_CONTAINERS = [
  'gluetun',
  'qbittorrent',
  'sabnzbd',
  'sonarr',
  'radarr',
  'prowlarr',
  'bazarr',
  'media-ui',
];

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const [statusResult, ipResult, portResult, tunnelResult, containerStats] =
      await Promise.allSettled([
        getVpnStatus(),
        getPublicIP(),
        getPortForward(),
        getTunnelStats(),
        getContainerNetworkStats(MONITORED_CONTAINERS),
      ]);

    const gluetunRunning =
      statusResult.status === 'fulfilled' &&
      statusResult.value.status === 'running';

    const ip = ipResult.status === 'fulfilled' && ipResult.value.public_ip
      ? ipResult.value.public_ip : null;
    let country = ipResult.status === 'fulfilled' && ipResult.value.country
      ? ipResult.value.country : null;

    if (ip && !country) {
      country = await lookupCountry(ip);
    }

    let status: VpnConnectionStatus;
    let statusMessage: string;

    if (statusResult.status === 'rejected') {
      status = 'disconnected';
      statusMessage = 'Gluetun is not reachable';
    } else if (!gluetunRunning) {
      status = 'disconnected';
      statusMessage = `VPN status: ${statusResult.value.status}`;
    } else if (ip) {
      status = 'connected';
      statusMessage = `Connected via ${ip}`;
    } else if (ipResult.status === 'rejected') {
      status = 'error';
      statusMessage = 'VPN tunnel is not passing traffic — check VPN credentials or server';
    } else {
      status = 'connecting';
      statusMessage = 'VPN is starting up — waiting for tunnel to establish';
    }

    const stats: NetworkStats = {
      vpn: {
        connected: status === 'connected',
        status,
        statusMessage,
        ip,
        country,
      },
      portForward:
        portResult.status === 'fulfilled' ? portResult.value.port : null,
      tunnel: tunnelResult.status === 'fulfilled' ? tunnelResult.value : null,
      services:
        containerStats.status === 'fulfilled' ? containerStats.value : [],
      timestamp: Date.now(),
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch network stats', service: 'network', statusCode: 500 },
      { status: 500 }
    );
  }
}
