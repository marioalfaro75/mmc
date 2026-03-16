import { NextRequest, NextResponse } from 'next/server';
import { getSeries, addSeries } from '@/lib/api/sonarr';

export async function GET() {
  if (!process.env.SONARR_API_KEY) {
    return NextResponse.json(
      { error: 'Sonarr API key not configured', reason: 'no_api_key', service: 'sonarr' },
      { status: 503 }
    );
  }
  try {
    const series = await getSeries();
    return NextResponse.json(series);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch series', reason: 'unavailable', service: 'sonarr' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const series = await addSeries(body);
    return NextResponse.json(series, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to add series', service: 'sonarr', statusCode: 500 },
      { status: 500 }
    );
  }
}
