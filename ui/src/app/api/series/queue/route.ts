import { NextRequest, NextResponse } from 'next/server';
import { getQueueDetails } from '@/lib/api/sonarr';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const seriesId = request.nextUrl.searchParams.get('seriesId');
    const queue = await getQueueDetails(seriesId ? parseInt(seriesId, 10) : undefined);
    return NextResponse.json(queue);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
