import { NextRequest, NextResponse } from 'next/server';
import { isTmdbConfigured, discoverMoviesByActor } from '@/lib/api/tmdb';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    if (!isTmdbConfigured()) {
      return NextResponse.json(
        { error: 'TMDB API key not configured. Add it in Settings → Services to enable actor search.', statusCode: 400 },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const actor = searchParams.get('actor');
    if (!actor) {
      return NextResponse.json(
        { error: 'Missing actor parameter', statusCode: 400 },
        { status: 400 }
      );
    }

    const results = await discoverMoviesByActor(actor);
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError(error), service: 'tmdb', statusCode: 500 },
      { status: 500 }
    );
  }
}
