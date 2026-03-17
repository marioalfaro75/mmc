import { NextResponse } from 'next/server';
import { getSystemStatus as getSonarrStatus } from '@/lib/api/sonarr';
import { getSystemStatus as getRadarrStatus } from '@/lib/api/radarr';
import { getSystemStatus as getProwlarrStatus } from '@/lib/api/prowlarr';
import { getVersion as getQbtVersion } from '@/lib/api/qbittorrent';
import { getVersion as getSabnzbdVersion } from '@/lib/api/sabnzbd';
import { getVpnStatus } from '@/lib/api/gluetun';
import { getStatus as getSeerrStatus } from '@/lib/api/seerr';
import { getSystemStatus as getBazarrStatus } from '@/lib/api/bazarr';
import type { ServiceHealth } from '@/lib/types/common';

async function checkService(
  name: string,
  url: string,
  checker: () => Promise<string | null>
): Promise<ServiceHealth> {
  try {
    const version = await checker();
    return { name, status: 'online', version, url };
  } catch {
    return { name, status: 'offline', version: null, url };
  }
}

export async function GET() {
  const services = await Promise.all([
    checkService('Sonarr', '/sonarr', async () => {
      const s = await getSonarrStatus();
      return s.version;
    }),
    checkService('Radarr', '/radarr', async () => {
      const s = await getRadarrStatus();
      return s.version;
    }),
    checkService('Prowlarr', '/prowlarr', async () => {
      const s = await getProwlarrStatus();
      return s.version;
    }),
    checkService('qBittorrent', '/qbittorrent', async () => {
      return await getQbtVersion();
    }),
    checkService('SABnzbd', '/sabnzbd', async () => {
      return await getSabnzbdVersion();
    }),
    checkService('Gluetun', '/gluetun', async () => {
      const s = await getVpnStatus();
      return s.status;
    }),
    checkService('Seerr', '/seerr', async () => {
      const s = await getSeerrStatus();
      return s.version;
    }),
    checkService('Bazarr', '/bazarr', async () => {
      const s = await getBazarrStatus();
      return s.data.bazarr_version;
    }),
  ]);

  return NextResponse.json({ services });
}
