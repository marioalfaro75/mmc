import { NextResponse } from 'next/server';
import { getRecentlyAdded } from '@/lib/api/plex';

export async function GET() {
  try {
    const items = await getRecentlyAdded(10);
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch recently added', service: 'plex', statusCode: 500 },
      { status: 500 }
    );
  }
}
