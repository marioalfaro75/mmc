import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe. Answers immediately, touches nothing.
 *
 * Deliberately separate from /api/health, which is a *stack* health
 * aggregator: it fans out to Sonarr, Radarr, Prowlarr, qBittorrent, SABnzbd,
 * Gluetun, Seerr and Bazarr and waits for all of them. Pointing Docker's
 * HEALTHCHECK at that meant one unreachable service — a stopped SABnzbd, say
 * — pushed the response past the probe timeout and marked the dashboard
 * unhealthy while it was serving perfectly well.
 *
 * "Is this process answering HTTP" and "is the whole stack well" are
 * different questions. This endpoint answers only the first.
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.MMC_VERSION || 'dev',
  });
}
