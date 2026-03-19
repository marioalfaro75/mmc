import { NextRequest, NextResponse } from 'next/server';
import { getSeries, addSeries, deleteSeries } from '@/lib/api/sonarr';

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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleteFiles = searchParams.get('deleteFiles') === 'true';

    if (!id) {
      return NextResponse.json({ error: 'Series ID is required' }, { status: 400 });
    }

    await deleteSeries(parseInt(id, 10), deleteFiles);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete series', service: 'sonarr' },
      { status: 500 }
    );
  }
}
