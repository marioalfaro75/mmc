'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpCircle, ChevronDown, ChevronRight, ExternalLink, Loader2, X } from 'lucide-react';
import { fetchApi } from '@/lib/utils/fetchApi';
import { useApplyUpdate } from '@/hooks/useApplyUpdate';
import type { UpdateCheckPayload } from '@/lib/updates';

const DISMISS_KEY = 'mmc.updateBanner.dismissedSha';
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function UpdateBanner() {
  const [dismissedSha, setDismissedSha] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(DISMISS_KEY);
    if (stored) setDismissedSha(stored);
  }, []);

  const { data } = useQuery<UpdateCheckPayload>({
    queryKey: ['updates', 'check'],
    queryFn: () => fetchApi<UpdateCheckPayload>('/api/updates/check'),
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS / 2,
    retry: 1,
  });

  const { apply, applying, running } = useApplyUpdate(data?.updateAvailable ?? false);

  if (!data?.updateAvailable || !data.remoteSha) return null;
  if (dismissedSha === data.remoteSha) return null;

  const dismiss = () => {
    if (!data.remoteSha) return;
    window.localStorage.setItem(DISMISS_KEY, data.remoteSha);
    setDismissedSha(data.remoteSha);
  };

  const commitWord = data.aheadBy === 1 ? 'commit' : 'commits';
  const busy = applying || running;

  return (
    <div className="mb-4 rounded-md border border-blue-500/40 bg-blue-500/10 p-3">
      <div className="flex items-center gap-3">
        <ArrowUpCircle className="h-5 w-5 shrink-0 text-blue-400" />
        <p className="flex-1 text-sm font-semibold text-foreground">
          Mars Media Centre update available — {data.aheadBy} new {commitWord} on{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs font-normal">{data.localBranch}</code>
        </p>
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpCircle className="h-3 w-3" />}
          {running ? 'Updating…' : applying ? 'Starting…' : 'Apply update'}
        </button>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-expanded={showDetails}
        >
          {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Details
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss until next update"
          title="Dismiss until next update"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {showDetails && (
        <div className="mt-3 space-y-2 border-t border-blue-500/20 pt-3 pl-8 text-xs text-muted-foreground">
          <p>
            You&apos;re on <code className="rounded bg-muted px-1 py-0.5">{data.localSha.slice(0, 7)}</code>.
            Latest is <code className="rounded bg-muted px-1 py-0.5">{data.remoteSha.slice(0, 7)}</code>.
          </p>
          {data.recentMessages.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {data.recentMessages.slice(0, 5).map((msg, i) => (
                <li key={i} className="truncate">{msg}</li>
              ))}
              {data.recentMessages.length > 5 && (
                <li className="italic">…and {data.recentMessages.length - 5} more</li>
              )}
            </ul>
          )}
          {data.compareUrl && (
            <a
              href={data.compareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:underline"
            >
              View diff on GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
