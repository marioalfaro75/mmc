import { NextResponse } from 'next/server';
import { getIndexers } from '@/lib/api/prowlarr';

// Lightweight read of Prowlarr's indexer count. Used by <IndexerWarning>
// to surface the "Prowlarr connected but no indexers" gap that otherwise
// makes requests silently succeed and never download.
//
// Returns `count: null` when we can't reach Prowlarr at all — the UI
// uses that to suppress the warning (an unreachable Prowlarr is a
// different problem, surfaced elsewhere).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const indexers = await getIndexers();
    return NextResponse.json({ count: indexers.length });
  } catch {
    return NextResponse.json({ count: null });
  }
}
