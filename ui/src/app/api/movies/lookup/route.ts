import { NextRequest, NextResponse } from 'next/server';
import { lookupMovie } from '@/lib/api/radarr';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get('term');
    if (!term) {
      return NextResponse.json(
        { error: 'Missing term parameter', service: 'radarr', statusCode: 400 },
        { status: 400 }
      );
    }
    const results = await lookupMovie(term);
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to lookup movie', service: 'radarr', statusCode: 500 },
      { status: 500 }
    );
  }
}
