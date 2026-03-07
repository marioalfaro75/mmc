import { NextRequest, NextResponse } from 'next/server';
import { getCalendar as getSonarrCalendar } from '@/lib/api/sonarr';
import { getCalendar as getRadarrCalendar } from '@/lib/api/radarr';
import type { CalendarItem } from '@/lib/types/common';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || new Date().toISOString().split('T')[0];
    const end = searchParams.get('end') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [sonarrResult, radarrResult] = await Promise.allSettled([
      getSonarrCalendar(start, end),
      getRadarrCalendar(start, end),
    ]);

    const items: CalendarItem[] = [];

    if (sonarrResult.status === 'fulfilled') {
      for (const ep of sonarrResult.value) {
        const poster = ep.series?.images?.find(i => i.coverType === 'poster');
        items.push({
          id: `sonarr-${ep.id}`,
          type: 'episode',
          title: ep.series?.title || 'Unknown Series',
          subtitle: ep.title,
          seasonNumber: ep.seasonNumber,
          episodeNumber: ep.episodeNumber,
          airDate: ep.airDateUtc || ep.airDate,
          posterUrl: poster?.remoteUrl || null,
          monitored: ep.monitored,
          hasFile: ep.hasFile,
          quality: '',
          sourceService: 'sonarr',
          sourceId: ep.seriesId,
        });
      }
    }

    if (radarrResult.status === 'fulfilled') {
      for (const movie of radarrResult.value) {
        const poster = movie.images?.find(i => i.coverType === 'poster');
        items.push({
          id: `radarr-${movie.id}`,
          type: 'movie',
          title: movie.title,
          subtitle: null,
          seasonNumber: null,
          episodeNumber: null,
          airDate: movie.digitalRelease || movie.physicalRelease || movie.inCinemas,
          posterUrl: poster?.remoteUrl || null,
          monitored: movie.monitored,
          hasFile: movie.hasFile,
          quality: '',
          sourceService: 'radarr',
          sourceId: movie.id,
        });
      }
    }

    items.sort((a, b) => new Date(a.airDate).getTime() - new Date(b.airDate).getTime());

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch calendar', service: 'calendar', statusCode: 500 },
      { status: 500 }
    );
  }
}
