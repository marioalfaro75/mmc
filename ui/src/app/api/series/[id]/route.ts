import { NextRequest, NextResponse } from 'next/server';
import { getSeriesById, updateSeries } from '@/lib/api/sonarr';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(_request);
  if (denied) return denied;

  const { id } = await params;
  const seriesId = parseInt(id, 10);

  if (isNaN(seriesId) || seriesId < 1) {
    return NextResponse.json({ error: 'Invalid series ID' }, { status: 400 });
  }

  try {
    const series = await getSeriesById(seriesId);
    return NextResponse.json(series);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch series', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const seriesId = parseInt(id, 10);

  if (isNaN(seriesId) || seriesId < 1) {
    return NextResponse.json({ error: 'Invalid series ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    if (body.id !== seriesId) {
      return NextResponse.json({ error: 'Series ID mismatch' }, { status: 400 });
    }
    const updated = await updateSeries(body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update series', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
