import { NextResponse } from 'next/server';
import {
  getRootFolders, addRootFolder,
  getDownloadClients, addDownloadClient,
  getNaming, updateNaming,
} from '@/lib/api/sonarr';
import { downloadClientFlags } from '@/lib/api/download-clients';
import { requireAdmin } from '@/lib/auth';

type StepResult = {
  step: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: 'disabled' | 'already_configured' | 'no_api_key';
  error?: string;
};

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const results: StepResult[] = [];
  const { useQbittorrent, useSabnzbd } = downloadClientFlags();

  // Root folder
  try {
    const folders = await getRootFolders();
    if (folders.some((f) => f.path === '/data/media/tv')) {
      results.push({ step: 'root-folder', status: 'skipped' });
    } else {
      await addRootFolder('/data/media/tv');
      results.push({ step: 'root-folder', status: 'ok' });
    }
  } catch (error) {
    results.push({ step: 'root-folder', status: 'error', error: String(error) });
  }

  // qBittorrent download client
  if (!useQbittorrent) {
    results.push({ step: 'qbittorrent-client', status: 'skipped', reason: 'disabled' });
  } else {
    const qbtPassword = process.env.QBITTORRENT_PASSWORD || '';
    try {
      const clients = await getDownloadClients();
      if (clients.some((c) => c.implementation === 'QBittorrent')) {
        results.push({ step: 'qbittorrent-client', status: 'skipped', reason: 'already_configured' });
      } else {
        await addDownloadClient({
          enable: true,
          protocol: 'torrent',
          priority: 1,
          name: 'qBittorrent',
          implementation: 'QBittorrent',
          configContract: 'QBittorrentSettings',
          fields: [
            { name: 'host', value: 'gluetun' },
            { name: 'port', value: 8080 },
            { name: 'username', value: 'admin' },
            { name: 'password', value: qbtPassword },
            { name: 'category', value: 'sonarr' },
            { name: 'useSsl', value: false },
          ],
        });
        results.push({ step: 'qbittorrent-client', status: 'ok' });
      }
    } catch (error) {
      results.push({ step: 'qbittorrent-client', status: 'error', error: String(error) });
    }
  }

  // SABnzbd download client
  if (!useSabnzbd) {
    results.push({ step: 'sabnzbd-client', status: 'skipped', reason: 'disabled' });
  } else if (!process.env.SABNZBD_API_KEY) {
    results.push({ step: 'sabnzbd-client', status: 'skipped', reason: 'no_api_key' });
  } else {
    const sabnzbdKey = process.env.SABNZBD_API_KEY;
    try {
      const clients = await getDownloadClients();
      if (clients.some((c) => c.implementation === 'Sabnzbd')) {
        results.push({ step: 'sabnzbd-client', status: 'skipped', reason: 'already_configured' });
      } else {
        await addDownloadClient({
          enable: true,
          protocol: 'usenet',
          priority: 1,
          name: 'SABnzbd',
          implementation: 'Sabnzbd',
          configContract: 'SabnzbdSettings',
          fields: [
            { name: 'host', value: 'gluetun' },
            { name: 'port', value: 8081 },
            { name: 'apiKey', value: sabnzbdKey },
            { name: 'category', value: 'tv' },
            { name: 'useSsl', value: false },
          ],
        });
        results.push({ step: 'sabnzbd-client', status: 'ok' });
      }
    } catch (error) {
      results.push({ step: 'sabnzbd-client', status: 'error', error: String(error) });
    }
  }

  // Naming
  try {
    const naming = await getNaming();
    await updateNaming({
      ...naming,
      renameEpisodes: true,
      standardEpisodeFormat: '{Series TitleYear} - S{season:00}E{episode:00} - {Episode CleanTitle} [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}',
      seriesFolderFormat: '{Series TitleYear}',
    });
    results.push({ step: 'naming', status: 'ok' });
  } catch (error) {
    results.push({ step: 'naming', status: 'error', error: String(error) });
  }

  const hasError = results.some((r) => r.status === 'error');
  return NextResponse.json({ success: !hasError, results }, { status: hasError ? 207 : 200 });
}
