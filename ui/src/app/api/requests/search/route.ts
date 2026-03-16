import { NextRequest, NextResponse } from 'next/server';
import { searchMedia } from '@/lib/api/seerr';
import { sanitizeError } from '@/lib/security';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (!process.env.SEERR_API_KEY) {
    return NextResponse.json(
      { error: 'Seerr API key not configured', reason: 'no_api_key' },
      { status: 503 }
    );
  }

  try {
    const data = await searchMedia(query);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'Search failed', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
