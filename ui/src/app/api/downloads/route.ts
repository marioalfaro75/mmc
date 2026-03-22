import { NextResponse } from 'next/server';
import { getTorrents } from '@/lib/api/qbittorrent';
import { getQueue as getSabnzbdQueue } from '@/lib/api/sabnzbd';
import { getQueue as getSonarrQueue } from '@/lib/api/sonarr';
import { getQueue as getRadarrQueue } from '@/lib/api/radarr';
import type { DownloadItem } from '@/lib/types/common';

interface ArrQueueRecord {
  id: number;
  title: string;
  status: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  size: number;
  sizeleft: number;
  protocol: string;
  seriesId?: number;
  episodeId?: number;
  movieId?: number;
  statusMessages?: { title: string; messages: string[] }[];
  errorMessage?: string;
}

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
    const [torrentsResult, sabnzbdResult, sonarrQueueResult, radarrQueueResult] = await Promise.allSettled([
      getTorrents(),
      getSabnzbdQueue(),
      getSonarrQueue(),
      getRadarrQueue(),
    ]);

    const items: DownloadItem[] = [];

    if (torrentsResult.status === 'fulfilled') {
      for (const t of torrentsResult.value) {
        const mapped = mapTorrentStatus(t.state);
        const status = t.progress >= 1 && mapped !== 'failed' ? (mapped === 'seeding' ? 'seeding' : 'completed') : mapped;
        items.push({
          id: `torrent-${t.hash}`,
          source: 'torrent',
          name: t.name,
          category: mapCategory(t.category),
          status,
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

    // Merge Sonarr/Radarr queue items that have import warnings
    const mapArrQueueItems = (
      result: PromiseSettledResult<{ records: unknown[] }>,
      service: 'sonarr' | 'radarr'
    ) => {
      if (result.status !== 'fulfilled') return;
      for (const raw of result.value.records) {
        const r = raw as ArrQueueRecord;
        const isWarning = r.status === 'warning' || r.trackedDownloadStatus === 'warning' || r.trackedDownloadState === 'importBlocked';
        if (!isWarning) continue;
        const warnings = [
          ...(r.statusMessages || []).flatMap(sm => sm.messages),
          ...(r.errorMessage ? [r.errorMessage] : []),
        ];
        items.push({
          id: `${service}-queue-${r.id}`,
          source: r.protocol === 'usenet' ? 'usenet' : 'torrent',
          name: r.title,
          category: service === 'sonarr' ? 'tv' : 'movies',
          status: 'warning',
          progress: r.size > 0 ? (r.size - r.sizeleft) / r.size : 1,
          sizeBytes: r.size,
          downloadedBytes: r.size - r.sizeleft,
          speedBytesPerSecond: 0,
          etaSeconds: null,
          addedAt: new Date().toISOString(),
          completedAt: null,
          seeds: null,
          peers: null,
          ratio: null,
          repairProgress: null,
          unpackProgress: null,
          warnings,
          arrQueueId: r.id,
          arrService: service,
          arrMediaId: service === 'sonarr' ? r.seriesId : r.movieId,
          arrEpisodeId: r.episodeId,
        });
      }
    }

    mapArrQueueItems(sonarrQueueResult, 'sonarr');
    mapArrQueueItems(radarrQueueResult, 'radarr');

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
