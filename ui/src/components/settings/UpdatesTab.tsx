'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/common/Card';
import { fetchApi } from '@/lib/utils/fetchApi';
import { useApplyUpdate } from '@/hooks/useApplyUpdate';
import type { UpdateCheckPayload } from '@/lib/updates';

export function UpdatesTab() {
  const queryClient = useQueryClient();
  const logRef = useRef<HTMLPreElement>(null);

  const check = useQuery<UpdateCheckPayload>({
    queryKey: ['updates', 'check'],
    queryFn: () => fetchApi<UpdateCheckPayload>('/api/updates/check'),
    staleTime: 60 * 60 * 1000, // 1 h, matches the API-side cache
  });

  const { apply, applying, running, status } = useApplyUpdate(
    check.data?.updateAvailable ?? false,
  );

  // Auto-scroll the log pane as new bytes arrive.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [status?.logBytes]);

  const forceCheck = useCallback(async () => {
    await fetchApi<UpdateCheckPayload>('/api/updates/check?force=1').catch(() => null);
    queryClient.invalidateQueries({ queryKey: ['updates', 'check'] });
    toast.success('Checked');
  }, [queryClient]);

  if (check.isLoading) {
    return (
      <Card className="p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const data = check.data;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Mars Media Centre</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Current:{' '}
              <code className="rounded bg-muted px-1 py-0.5">
                {data?.localSha ? data.localSha.slice(0, 7) : 'unknown'}
              </code>{' '}
              on branch <code className="rounded bg-muted px-1 py-0.5">{data?.localBranch ?? 'unknown'}</code>
            </p>
            {data?.checkedAt && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Last checked {new Date(data.checkedAt).toLocaleString()}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={forceCheck}
            disabled={check.isFetching}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${check.isFetching ? 'animate-spin' : ''}`} />
            Check now
          </button>
        </div>

        {data?.error && (
          <p className="text-xs text-yellow-400">{data.error}</p>
        )}

        {data?.updateAvailable && data.remoteSha && (
          <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3">
            <div className="flex items-start gap-3">
              <ArrowUpCircle className="h-5 w-5 shrink-0 text-blue-400" />
              <div className="flex-1 space-y-2 text-sm">
                <p className="font-semibold">
                  Update available — {data.aheadBy} new commit{data.aheadBy === 1 ? '' : 's'} on{' '}
                  <code className="rounded bg-muted px-1 py-0.5">{data.localBranch}</code>
                </p>
                {data.recentMessages.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {data.recentMessages.slice(0, 8).map((msg, i) => (
                      <li key={i} className="truncate">{msg}</li>
                    ))}
                    {data.recentMessages.length > 8 && (
                      <li className="italic">…and {data.recentMessages.length - 8} more</li>
                    )}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={apply}
                    disabled={applying || running}
                    className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {applying || running ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="h-3 w-3" />
                    )}
                    {running ? 'Updating…' : 'Apply update'}
                  </button>
                  {data.compareUrl && (
                    <a
                      href={data.compareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
                    >
                      View diff on GitHub
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!data?.updateAvailable && !data?.error && (
          <p className="inline-flex items-center gap-1.5 text-xs text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            You're on the latest commit.
          </p>
        )}
      </Card>

      {(running || (status?.logTail && status.logTail.length > 0)) && (
        <Card className="space-y-2 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Terminal className="h-3 w-3" />
            <span>
              Update log
              {status?.jobId && (
                <span className="ml-2 font-mono">({status.jobId})</span>
              )}
              {running && <span className="ml-2">— in progress</span>}
            </span>
          </div>
          <pre
            ref={logRef}
            className="max-h-[480px] overflow-auto rounded bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
          >
            {status?.logTail || 'Waiting for output…'}
          </pre>
          {running && (
            <p className="text-xs text-muted-foreground">
              The dashboard will briefly disconnect when media-ui is recreated; this page will
              reload automatically once the new instance is healthy.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
