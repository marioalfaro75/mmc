import { NextResponse } from 'next/server';
import { buildAppUpdatesPayload, type AppUpdatesPayload } from '@/lib/app-updates';
import { sanitizeError } from '@/lib/security';

export const dynamic = 'force-dynamic';

// Match /api/updates/check — same TTL, same force=1 escape hatch.
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { ts: number; payload: AppUpdatesPayload } | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const payload = await buildAppUpdatesPayload();
    cache = { ts: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    // Per-row failures are reported inside the payload; a top-level throw
    // means we couldn't even read .env. Don't cache it.
    return NextResponse.json(
      { error: sanitizeError(err) },
      { status: 500 },
    );
  }
}
