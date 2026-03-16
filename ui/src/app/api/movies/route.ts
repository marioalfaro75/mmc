import { NextRequest, NextResponse } from 'next/server';
import { getMovies, addMovie } from '@/lib/api/radarr';

export async function GET() {
  if (!process.env.RADARR_API_KEY) {
    return NextResponse.json(
      { error: 'Radarr API key not configured', reason: 'no_api_key', service: 'radarr' },
      { status: 503 }
    );
  }
  try {
    const movies = await getMovies();
    return NextResponse.json(movies);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch movies', reason: 'unavailable', service: 'radarr' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const movie = await addMovie(body);
    return NextResponse.json(movie, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to add movie', service: 'radarr', statusCode: 500 },
      { status: 500 }
    );
  }
}
