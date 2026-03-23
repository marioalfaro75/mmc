import { NextResponse } from 'next/server';
import { getVpnStatus, getPublicIP } from '@/lib/api/gluetun';
import { lookupCountry } from '@/lib/api/geolocation';
import type { VpnStatus, VpnConnectionStatus } from '@/lib/types/common';

export async function GET() {
  try {
    const [statusResult, ipResult] = await Promise.allSettled([
      getVpnStatus(),
      getPublicIP(),
    ]);

    const gluetunRunning = statusResult.status === 'fulfilled' &&
      statusResult.value.status === 'running';

    const ip = ipResult.status === 'fulfilled' && ipResult.value.public_ip
      ? ipResult.value.public_ip : null;
    let country = ipResult.status === 'fulfilled' && ipResult.value.country
      ? ipResult.value.country : null;

    // Gluetun may omit country — fall back to IP geolocation
    if (ip && !country) {
      country = await lookupCountry(ip);
    }

    // Determine granular connection status
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
      // Gluetun says running, IP endpoint responded but returned empty
      status = 'connecting';
      statusMessage = 'VPN is starting up — waiting for tunnel to establish';
    }

    const vpn: VpnStatus = {
      connected: status === 'connected',
      status,
      statusMessage,
      ip,
      country,
    };

    return NextResponse.json(vpn);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch VPN status', service: 'gluetun', statusCode: 500 },
      { status: 500 }
    );
  }
}
