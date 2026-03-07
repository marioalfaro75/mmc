import { NextRequest, NextResponse } from 'next/server';
import { getMovies, addMovie } from '@/lib/api/radarr';

export async function GET() {
  try {
    const movies = await getMovies();
    return NextResponse.json(movies);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch movies', service: 'radarr', statusCode: 500 },
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
