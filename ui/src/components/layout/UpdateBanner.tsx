'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpCircle, ExternalLink, X } from 'lucide-react';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { UpdateCheckPayload } from '@/lib/updates';

const DISMISS_KEY = 'mmc.updateBanner.dismissedSha';
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function UpdateBanner() {
  const [dismissedSha, setDismissedSha] = useState<string | null>(null);

  // Hydrate dismissal state from localStorage on mount.
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

  if (!data?.updateAvailable || !data.remoteSha) return null;
  if (dismissedSha === data.remoteSha) return null;

  const dismiss = () => {
    if (!data.remoteSha) return;
    window.localStorage.setItem(DISMISS_KEY, data.remoteSha);
    setDismissedSha(data.remoteSha);
  };

  const ahead = data.aheadBy > 0 ? ` (${data.aheadBy} new commit${data.aheadBy === 1 ? '' : 's'})` : '';

  return (
    <div className="mb-4 rounded-md border border-blue-500/40 bg-blue-500/10 p-3">
      <div className="flex items-start gap-3">
        <ArrowUpCircle className="h-5 w-5 shrink-0 text-blue-400" />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-foreground">
            Mars Media Centre update available{ahead}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You're on <code className="rounded bg-muted px-1 py-0.5">{data.localSha.slice(0, 7)}</code>.
            Latest on <code className="rounded bg-muted px-1 py-0.5">{data.localBranch}</code> is{' '}
            <code className="rounded bg-muted px-1 py-0.5">{data.remoteSha.slice(0, 7)}</code>.
          </p>
          {data.recentMessages.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {data.recentMessages.slice(0, 5).map((msg, i) => (
                <li key={i} className="truncate">{msg}</li>
              ))}
              {data.recentMessages.length > 5 && (
                <li className="italic">…and {data.recentMessages.length - 5} more</li>
              )}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
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
            <span className="text-muted-foreground">
              Apply with{' '}
              <code className="rounded bg-muted px-1 py-0.5">./scripts/deploy.sh --update</code>
              {' '}or use Settings → Updates.
            </span>
          </div>
        </div>
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
    </div>
  );
}
