import { NextRequest, NextResponse } from 'next/server';
import { getSeries, massUpdateSeries } from '@/lib/api/sonarr';
import { getMovies, massUpdateMovies } from '@/lib/api/radarr';
import { sanitizeError } from '@/lib/security';

export async function PUT(request: NextRequest) {
  try {
    const { service, qualityProfileId } = await request.json();

    if (service !== 'sonarr' && service !== 'radarr') {
      return NextResponse.json({ error: 'Invalid service' }, { status: 400 });
    }

    if (typeof qualityProfileId !== 'number' || qualityProfileId < 1) {
      return NextResponse.json({ error: 'Invalid quality profile ID' }, { status: 400 });
    }

    let updatedCount = 0;

    if (service === 'sonarr') {
      const series = await getSeries();
      const ids = series.filter(s => s.qualityProfileId !== qualityProfileId).map(s => s.id);
      if (ids.length > 0) {
        await massUpdateSeries(ids, '', qualityProfileId);
        updatedCount = ids.length;
      }
    } else {
      const movies = await getMovies();
      const ids = movies.filter(m => m.qualityProfileId !== qualityProfileId).map(m => m.id);
      if (ids.length > 0) {
        await massUpdateMovies(ids, '', qualityProfileId);
        updatedCount = ids.length;
      }
    }

    return NextResponse.json({ success: true, updatedCount });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to bulk update profiles', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
