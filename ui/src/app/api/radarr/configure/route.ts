import { NextResponse } from 'next/server';
import {
  getRootFolders, addRootFolder,
  getDownloadClients, addDownloadClient,
  getNaming, updateNaming,
} from '@/lib/api/radarr';
import { requireAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const results: { step: string; status: 'ok' | 'skipped' | 'error'; error?: string }[] = [];

  // Root folder
  try {
    const folders = await getRootFolders();
    if (folders.some((f) => f.path === '/data/media/movies')) {
      results.push({ step: 'root-folder', status: 'skipped' });
    } else {
      await addRootFolder('/data/media/movies');
      results.push({ step: 'root-folder', status: 'ok' });
    }
  } catch (error) {
    results.push({ step: 'root-folder', status: 'error', error: String(error) });
  }

  // qBittorrent download client
  const qbtPassword = process.env.QBITTORRENT_PASSWORD || '';
  try {
    const clients = await getDownloadClients();
    if (clients.some((c) => c.implementation === 'QBittorrent')) {
      results.push({ step: 'qbittorrent-client', status: 'skipped' });
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
          { name: 'category', value: 'radarr' },
          { name: 'useSsl', value: false },
        ],
      });
      results.push({ step: 'qbittorrent-client', status: 'ok' });
    }
  } catch (error) {
    results.push({ step: 'qbittorrent-client', status: 'error', error: String(error) });
  }

  // SABnzbd download client
  const sabnzbdKey = process.env.SABNZBD_API_KEY;
  if (sabnzbdKey) {
    try {
      const clients = await getDownloadClients();
      if (clients.some((c) => c.implementation === 'Sabnzbd')) {
        results.push({ step: 'sabnzbd-client', status: 'skipped' });
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
            { name: 'category', value: 'movies' },
            { name: 'useSsl', value: false },
          ],
        });
        results.push({ step: 'sabnzbd-client', status: 'ok' });
      }
    } catch (error) {
      results.push({ step: 'sabnzbd-client', status: 'error', error: String(error) });
    }
  } else {
    results.push({ step: 'sabnzbd-client', status: 'skipped' });
  }

  // Naming
  try {
    const naming = await getNaming();
    await updateNaming({
      ...naming,
      renameMovies: true,
      movieFolderFormat: '{Movie CleanTitle} ({Release Year})',
      standardMovieFormat: '{Movie CleanTitle} {(Release Year)} [imdbid-{ImdbId}] - [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}',
    });
    results.push({ step: 'naming', status: 'ok' });
  } catch (error) {
    results.push({ step: 'naming', status: 'error', error: String(error) });
  }

  const hasError = results.some((r) => r.status === 'error');
  return NextResponse.json({ success: !hasError, results }, { status: hasError ? 207 : 200 });
}
