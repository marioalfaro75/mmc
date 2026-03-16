import { NextResponse } from 'next/server';
import { getTorrents } from '@/lib/api/qbittorrent';
import { getQueue as getSabnzbdQueue } from '@/lib/api/sabnzbd';
import type { DownloadItem } from '@/lib/types/common';

function mapTorrentStatus(state: string): DownloadItem['status'] {
  switch (state) {
    case 'downloading': case 'metaDL': case 'forcedDL': case 'forcedMetaDL': return 'downloading';
    case 'pausedDL': case 'pausedUP': case 'stoppedDL': case 'stoppedUP': return 'paused';
    case 'queuedDL': case 'queuedUP': case 'stalledDL': case 'allocating': return 'queued';
    case 'uploading': case 'stalledUP': case 'forcedUP': return 'seeding';
    case 'checkingDL': case 'checkingUP': case 'checkingResumeData': case 'moving': return 'downloading';
    case 'error': case 'missingFiles': return 'failed';
    default: return 'downloading';
  }
}

function mapCategory(cat: string): DownloadItem['category'] {
  if (cat === 'radarr' || cat === 'movies') return 'movies';
  if (cat === 'sonarr' || cat === 'tv') return 'tv';
  return 'other';
}

export async function GET() {
  try {
    const [torrentsResult, sabnzbdResult] = await Promise.allSettled([
      getTorrents(),
      getSabnzbdQueue(),
    ]);

    const items: DownloadItem[] = [];

    if (torrentsResult.status === 'fulfilled') {
      for (const t of torrentsResult.value) {
        items.push({
          id: `torrent-${t.hash}`,
          source: 'torrent',
          name: t.name,
          category: mapCategory(t.category),
          status: mapTorrentStatus(t.state),
          progress: t.progress,
          sizeBytes: t.size,
          downloadedBytes: Math.round(t.size * t.progress),
          speedBytesPerSecond: t.dlspeed,
          etaSeconds: t.eta === 8640000 ? null : t.eta,
          addedAt: new Date(t.added_on * 1000).toISOString(),
          completedAt: t.completion_on > 0 ? new Date(t.completion_on * 1000).toISOString() : null,
          seeds: t.num_seeds,
          peers: t.num_leechs,
          ratio: t.ratio,
          repairProgress: null,
          unpackProgress: null,
        });
      }
    }

    if (sabnzbdResult.status === 'fulfilled') {
      for (const s of sabnzbdResult.value.slots) {
        const totalMb = parseFloat(s.mb);
        const leftMb = parseFloat(s.mbleft);
        items.push({
          id: `usenet-${s.nzo_id}`,
          source: 'usenet',
          name: s.filename,
          category: mapCategory(s.cat),
          status: s.status === 'Downloading' ? 'downloading' : s.status === 'Paused' ? 'paused' : 'queued',
          progress: totalMb > 0 ? (totalMb - leftMb) / totalMb : 0,
          sizeBytes: totalMb * 1024 * 1024,
          downloadedBytes: (totalMb - leftMb) * 1024 * 1024,
          speedBytesPerSecond: 0,
          etaSeconds: null,
          addedAt: new Date().toISOString(),
          completedAt: null,
          seeds: null,
          peers: null,
          ratio: null,
          repairProgress: null,
          unpackProgress: null,
        });
      }
    }

    return NextResponse.json({
      items,
      clients: {
        torrent: torrentsResult.status === 'fulfilled',
        usenet: sabnzbdResult.status === 'fulfilled',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch downloads', service: 'downloads', statusCode: 500 },
      { status: 500 }
    );
  }
}
