import { NextResponse } from 'next/server';
import {
  readLocalState,
  fetchRemoteState,
  type UpdateCheckPayload,
} from '@/lib/updates';
import { sanitizeError } from '@/lib/security';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: { ts: number; payload: UpdateCheckPayload } | null = null;

/** Check whether a newer commit exists on the configured remote branch. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  let localSha = '';
  let localBranch = 'unknown';
  let repoUrl: string | null = null;
  try {
    const local = await readLocalState();
    localSha = local.localSha;
    localBranch = local.localBranch;
    repoUrl = local.repoUrl;

    if (!local.repo) {
      const payload: UpdateCheckPayload = {
        localSha,
        localBranch,
        remoteSha: null,
        updateAvailable: false,
        aheadBy: 0,
        recentMessages: [],
        repoUrl,
        compareUrl: null,
        checkedAt: new Date().toISOString(),
        error: 'origin remote is not a recognised GitHub URL',
      };
      cache = { ts: Date.now(), payload };
      return NextResponse.json(payload);
    }

    const { remoteSha, aheadBy, recentMessages, compareUrl } =
      await fetchRemoteState(
        local.repo.owner,
        local.repo.repo,
        localBranch,
        localSha,
      );

    const payload: UpdateCheckPayload = {
      localSha,
      localBranch,
      remoteSha,
      updateAvailable: remoteSha !== null && remoteSha !== localSha,
      aheadBy,
      recentMessages,
      repoUrl,
      compareUrl,
      checkedAt: new Date().toISOString(),
    };
    cache = { ts: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    // Don't cache failures — next attempt should retry the network.
    const payload: UpdateCheckPayload = {
      localSha,
      localBranch,
      remoteSha: null,
      updateAvailable: false,
      aheadBy: 0,
      recentMessages: [],
      repoUrl,
      compareUrl: null,
      checkedAt: new Date().toISOString(),
      error: sanitizeError(err),
    };
    return NextResponse.json(payload);
  }
}
