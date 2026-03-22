import { NextResponse } from 'next/server';
import { getQualityProfiles as getSonarrProfiles, getSeries } from '@/lib/api/sonarr';
import { getQualityProfiles as getRadarrProfiles, getMovies } from '@/lib/api/radarr';
import { sanitizeError } from '@/lib/security';

interface ProfileInfo {
  id: number;
  name: string;
  upgradeAllowed: boolean;
  service: 'sonarr' | 'radarr';
  usedBy: number;
}

export async function GET() {
  try {
    const [sonarrProfiles, radarrProfiles, series, movies] = await Promise.all([
      getSonarrProfiles().catch(() => []),
      getRadarrProfiles().catch(() => []),
      getSeries().catch(() => []),
      getMovies().catch(() => []),
    ]);

    const profiles: ProfileInfo[] = [];

    // Count series per profile
    const seriesProfileCounts = new Map<number, number>();
    for (const s of series) {
      seriesProfileCounts.set(s.qualityProfileId, (seriesProfileCounts.get(s.qualityProfileId) || 0) + 1);
    }

    for (const p of sonarrProfiles) {
      profiles.push({
        id: p.id,
        name: p.name,
        upgradeAllowed: p.upgradeAllowed,
        service: 'sonarr',
        usedBy: seriesProfileCounts.get(p.id) || 0,
      });
    }

    // Count movies per profile
    const movieProfileCounts = new Map<number, number>();
    for (const m of movies) {
      movieProfileCounts.set(m.qualityProfileId, (movieProfileCounts.get(m.qualityProfileId) || 0) + 1);
    }

    for (const p of radarrProfiles) {
      profiles.push({
        id: p.id,
        name: p.name,
        upgradeAllowed: p.upgradeAllowed,
        service: 'radarr',
        usedBy: movieProfileCounts.get(p.id) || 0,
      });
    }

    return NextResponse.json({ profiles });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch quality profiles', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
