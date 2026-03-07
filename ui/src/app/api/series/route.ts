import { NextRequest, NextResponse } from 'next/server';
import { getSeries, addSeries } from '@/lib/api/sonarr';

export async function GET() {
  try {
    const series = await getSeries();
    return NextResponse.json(series);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch series', service: 'sonarr', statusCode: 500 },
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
