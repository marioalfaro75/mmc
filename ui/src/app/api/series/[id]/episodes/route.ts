import { NextResponse } from 'next/server';
import { getEpisodes } from '@/lib/api/sonarr';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(_request);
  if (denied) return denied;

  const { id } = await params;
  const seriesId = parseInt(id, 10);

  if (isNaN(seriesId) || seriesId < 1) {
    return NextResponse.json({ error: 'Invalid series ID' }, { status: 400 });
  }

  try {
    const episodes = await getEpisodes(seriesId);
    return NextResponse.json(episodes);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch episodes', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
