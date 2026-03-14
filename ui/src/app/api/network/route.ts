import { NextResponse } from 'next/server';
import { getVpnStatus, getPublicIP, getPortForward } from '@/lib/api/gluetun';
import { getTunnelStats, getContainerNetworkStats } from '@/lib/docker';
import type { NetworkStats } from '@/lib/types/common';

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

export async function GET() {
  try {
    const [statusResult, ipResult, portResult, tunnelResult, containerStats] =
      await Promise.allSettled([
        getVpnStatus(),
        getPublicIP(),
        getPortForward(),
        getTunnelStats(),
        getContainerNetworkStats(MONITORED_CONTAINERS),
      ]);

    const connected =
      statusResult.status === 'fulfilled' &&
      statusResult.value.status === 'running';

    const stats: NetworkStats = {
      vpn: {
        connected,
        ip: ipResult.status === 'fulfilled' ? ipResult.value.public_ip : null,
        country: ipResult.status === 'fulfilled' ? ipResult.value.country : null,
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
