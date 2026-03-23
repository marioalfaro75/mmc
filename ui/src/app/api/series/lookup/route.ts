import { NextRequest, NextResponse } from 'next/server';
import { lookupSeries } from '@/lib/api/sonarr';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get('term');
    if (!term) {
      return NextResponse.json(
        { error: 'Missing term parameter', service: 'sonarr', statusCode: 400 },
        { status: 400 }
      );
    }
    const results = await lookupSeries(term);
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to lookup series', service: 'sonarr', statusCode: 500 },
      { status: 500 }
    );
  }
}
