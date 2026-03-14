import { NextRequest, NextResponse } from 'next/server';
import { getQueueDetails } from '@/lib/api/sonarr';

export async function GET(request: NextRequest) {
  try {
    const seriesId = request.nextUrl.searchParams.get('seriesId');
    const queue = await getQueueDetails(seriesId ? parseInt(seriesId, 10) : undefined);
    return NextResponse.json(queue);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
