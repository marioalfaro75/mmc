import { NextResponse } from 'next/server';
import { getVpnStatus, getPublicIP } from '@/lib/api/gluetun';
import type { VpnStatus } from '@/lib/types/common';

export async function GET() {
  try {
    const [statusResult, ipResult] = await Promise.allSettled([
      getVpnStatus(),
      getPublicIP(),
    ]);

    const connected = statusResult.status === 'fulfilled' &&
      statusResult.value.status === 'running';

    const vpn: VpnStatus = {
      connected,
      ip: ipResult.status === 'fulfilled' ? ipResult.value.public_ip : null,
      country: ipResult.status === 'fulfilled' ? ipResult.value.country : null,
    };

    return NextResponse.json(vpn);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch VPN status', service: 'gluetun', statusCode: 500 },
      { status: 500 }
    );
  }
}
