import { NextRequest, NextResponse } from 'next/server';
import { getRequests, createRequest, deleteRequest, getMovieDetails, getTvDetails } from '@/lib/api/seerr';
import { sanitizeError } from '@/lib/security';

export async function GET() {
  if (!process.env.SEERR_API_KEY) {
    return NextResponse.json(
      { error: 'Seerr API key not configured', reason: 'no_api_key', service: 'seerr' },
      { status: 503 }
    );
  }
  try {
    const data = await getRequests();

    // Enrich requests with titles from TMDB via Seerr
    const enriched = await Promise.all(
      data.results.map(async (req) => {
        if (req.media?.title || req.media?.name) return req;
        const tmdbId = req.media?.tmdbId;
        if (!tmdbId) return req;
        try {
          if (req.type === 'movie') {
            const details = await getMovieDetails(tmdbId);
            return { ...req, media: { ...req.media, title: details.title, posterPath: details.posterPath } };
          } else {
            const details = await getTvDetails(tmdbId);
            return { ...req, media: { ...req.media, name: details.name, posterPath: details.posterPath } };
          }
        } catch {
          return req;
        }
      })
    );

    return NextResponse.json({ ...data, results: enriched });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('403')) {
      return NextResponse.json(
        { error: 'Seerr setup incomplete', reason: 'setup_required', service: 'seerr' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch requests', reason: 'unavailable', service: 'seerr' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'delete' && body.id) {
      await deleteRequest(body.id);
      return NextResponse.json({ status: 'deleted' });
    }

    const result = await createRequest(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process request', details: sanitizeError(error) },
      { status: 500 }
    );
  }
}
