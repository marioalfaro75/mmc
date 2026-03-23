import { NextRequest, NextResponse } from 'next/server';
import { getQueueDetails } from '@/lib/api/radarr';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const movieId = request.nextUrl.searchParams.get('movieId');
    const queue = await getQueueDetails(movieId ? parseInt(movieId, 10) : undefined);
    return NextResponse.json(queue);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
