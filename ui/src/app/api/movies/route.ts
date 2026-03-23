import { NextRequest, NextResponse } from 'next/server';
import { getMovies, addMovie, deleteMovie } from '@/lib/api/radarr';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
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
  const denied = requireAdmin(request);
  if (denied) return denied;

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

export async function DELETE(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleteFiles = searchParams.get('deleteFiles') === 'true';

    if (!id) {
      return NextResponse.json({ error: 'Movie ID is required' }, { status: 400 });
    }

    await deleteMovie(parseInt(id, 10), deleteFiles);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete movie', service: 'radarr' },
      { status: 500 }
    );
  }
}
