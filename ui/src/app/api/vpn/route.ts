import { NextResponse } from 'next/server';
import { getVpnStatus, getPublicIP } from '@/lib/api/gluetun';
import { lookupCountry } from '@/lib/api/geolocation';
import type { VpnStatus } from '@/lib/types/common';

export async function GET() {
  try {
    const [statusResult, ipResult] = await Promise.allSettled([
      getVpnStatus(),
      getPublicIP(),
    ]);

    const connected = statusResult.status === 'fulfilled' &&
      statusResult.value.status === 'running';

    const ip = ipResult.status === 'fulfilled' && ipResult.value.public_ip
      ? ipResult.value.public_ip : null;
    let country = ipResult.status === 'fulfilled' && ipResult.value.country
      ? ipResult.value.country : null;

    // Gluetun may omit country — fall back to IP geolocation
    if (ip && !country) {
      country = await lookupCountry(ip);
    }

    const vpn: VpnStatus = { connected, ip, country };

    return NextResponse.json(vpn);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch VPN status', service: 'gluetun', statusCode: 500 },
      { status: 500 }
    );
  }
}
