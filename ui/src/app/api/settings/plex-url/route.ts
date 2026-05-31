import { NextResponse } from 'next/server';
import { readEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Return the current Plex URL from .env on disk (not from process.env).
 *
 * The Sidebar uses this to render its "Plex" external link without
 * needing a media-ui container restart when the value changes — the
 * captured process.env.PLEX_URL would otherwise stay stale until the
 * container recycles. Open endpoint: the URL itself isn't sensitive,
 * the link is shown to every dashboard visitor.
 */
export async function GET() {
  try {
    const env = readEnv();
    return NextResponse.json({ plexUrl: env.PLEX_URL || null });
  } catch {
    return NextResponse.json({ plexUrl: null });
  }
}
