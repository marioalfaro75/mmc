'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/common/Card';
import { fetchApi } from '@/lib/utils/fetchApi';
import { useApplyUpdate } from '@/hooks/useApplyUpdate';
import type { UpdateCheckPayload } from '@/lib/updates';
import type { AppUpdatesPayload, AppVersionInfo } from '@/lib/app-updates';

export function UpdatesTab() {
  const queryClient = useQueryClient();
  const logRef = useRef<HTMLPreElement>(null);

  const check = useQuery<UpdateCheckPayload>({
    queryKey: ['updates', 'check'],
    queryFn: () => fetchApi<UpdateCheckPayload>('/api/updates/check'),
    staleTime: 60 * 60 * 1000, // 1 h, matches the API-side cache
  });

  const apps = useQuery<AppUpdatesPayload>({
    queryKey: ['updates', 'apps'],
    queryFn: () => fetchApi<AppUpdatesPayload>('/api/updates/apps'),
    staleTime: 60 * 60 * 1000,
  });

  const { apply, applying, running, status } = useApplyUpdate(
    check.data?.updateAvailable ?? false,
  );

  // Per-app apply. Doesn't reload the page (sibling containers, not media-ui)
  // — just kicks off the sidecar and re-fetches the apps list when the
  // shared status lock releases.
  //
  // Per-app apply lifecycle. The naive "watch status.running flip back to
  // false → finished" check has a race: status.running starts at undefined
  // (not yet polled) or false (last poll showed no job), so the moment the
  // POST returns success we'd fire cleanup before the status query has
  // even noticed the sidecar exists. Explicit phases keep the button
  // showing progress through the whole run.
  //   idle → waiting (POST returned) → running (status.running=true seen) → idle
  type ApplyPhase = 'idle' | 'waiting' | 'running';
  const [appPhase, setAppPhase] = useState<ApplyPhase>('idle');
  const appPhaseKey = useRef<string | null>(null);
  const appPhaseLabel = useRef<string | null>(null);
  const appPhaseTag = useRef<string | null>(null);

  const applyAppMutation = useMutation<unknown, Error, AppVersionInfo>({
    mutationFn: async (app) => {
      const res = await fetch('/api/updates/apps/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: app.key, tag: app.latestTag }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (_data, app) => {
      appPhaseKey.current = app.key;
      appPhaseLabel.current = app.label;
      appPhaseTag.current = app.latestTag;
      setAppPhase('waiting');
      toast.success(`Updating ${app.label} → ${app.latestTag}`);
      queryClient.invalidateQueries({ queryKey: ['updates', 'status'] });
    },
    onError: (err) => toast.error(err.message || 'Apply failed'),
  });

  useEffect(() => {
    // waiting → running: the status poll has now caught the sidecar.
    if (appPhase === 'waiting' && status?.running) {
      setAppPhase('running');
      return;
    }
    // running → idle: sidecar finished. Parse the log tail to decide
    // success vs failure, then force-refresh the apps endpoint (just
    // invalidating would re-serve the 1h server-side cache from before
    // the apply).
    if (appPhase === 'running' && status?.running === false) {
      const tail = status?.logTail ?? '';
      const exitMatch = tail.match(/Done \(exit (\d+)\)/);
      const exitCode = exitMatch ? Number(exitMatch[1]) : null;
      const pullFailed = /Pull failed/.test(tail);
      const label = appPhaseLabel.current ?? 'App';
      const tag = appPhaseTag.current;
      if (pullFailed || (exitCode !== null && exitCode !== 0)) {
        const reason = pullFailed
          ? 'Image tag not found in the registry — .env was rolled back.'
          : `Updater exited with code ${exitCode}. Check the log below.`;
        toast.error(`${label} update failed. ${reason}`);
      } else {
        toast.success(tag ? `${label} updated to ${tag}.` : `${label} updated.`);
      }
      setAppPhase('idle');
      appPhaseKey.current = null;
      appPhaseLabel.current = null;
      appPhaseTag.current = null;
      // ?force=1 bypasses the 1h server-side cache so the row re-renders
      // with the new currentTag (or, on failure, the rolled-back one).
      fetchApi<AppUpdatesPayload>('/api/updates/apps?force=1')
        .catch(() => null)
        .finally(() => queryClient.invalidateQueries({ queryKey: ['updates', 'apps'] }));
    }
  }, [appPhase, status?.running, status?.logTail, queryClient]);

  // Auto-scroll the log pane as new bytes arrive.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [status?.logBytes]);

  const forceCheck = useCallback(async () => {
    await Promise.all([
      fetchApi<UpdateCheckPayload>('/api/updates/check?force=1').catch(() => null),
      fetchApi<AppUpdatesPayload>('/api/updates/apps?force=1').catch(() => null),
    ]);
    queryClient.invalidateQueries({ queryKey: ['updates', 'check'] });
    queryClient.invalidateQueries({ queryKey: ['updates', 'apps'] });
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

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Apps</h2>
          {apps.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground">
          Each app is pinned to a specific image tag in <code className="rounded bg-muted px-1 py-0.5">.env</code>.
          When a newer upstream release lands, bump the pin and recreate the container.
        </p>

        {apps.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="divide-y divide-border/60 rounded-md border border-border/60">
            {(apps.data?.apps ?? []).map((app) => {
              const isApplyingThis =
                applyAppMutation.isPending && applyAppMutation.variables?.key === app.key;
              // Stay "busy" for this row through the entire lifecycle —
              // POST in flight, waiting for status to catch the sidecar,
              // and the sidecar running. Without this the row would
              // briefly flip to "Up to date" between the POST returning
              // and the status poll noticing the new job, and again
              // before the apps endpoint re-fetches.
              const isPhaseBusyForThisApp =
                appPhase !== 'idle' && appPhaseKey.current === app.key;
              // Also catch the case where another tab/session started the
              // sidecar — the job ID encodes the service name.
              const isExternalBusy =
                running && !!status?.jobId && status.jobId.includes(`-${app.service}-`);
              const showSpinner = isApplyingThis || isPhaseBusyForThisApp || isExternalBusy;
              const showButton =
                (app.updateAvailable && !!app.latestTag) || showSpinner;
              const showUpToDate =
                !showButton && !app.updateAvailable && !app.error;
              const buttonLabel = showSpinner
                ? appPhase === 'waiting'
                  ? 'Starting…'
                  : 'Updating…'
                : `Apply ${app.latestTag}`;
              // Lock out applies on every row while ANY apply is running
              // (the lock file is shared, the server would 409 anyway).
              const lockedByOtherApp =
                !showSpinner && (running || appPhase !== 'idle');
              return (
                <div key={app.key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{app.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-1 py-0.5">{app.currentTag}</code>
                      {app.latestTag && (
                        <>
                          {' → '}
                          <code className={`rounded px-1 py-0.5 ${app.updateAvailable ? 'bg-blue-500/20 text-blue-300' : 'bg-muted'}`}>
                            {app.latestTag}
                          </code>
                        </>
                      )}
                      {app.releaseUrl && (
                        <a
                          href={app.releaseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-blue-400 hover:underline"
                        >
                          Notes
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                    {app.error && <p className="mt-0.5 text-xs text-yellow-400">{app.error}</p>}
                  </div>
                  {showButton && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Update ${app.label} from ${app.currentTag} to ${app.latestTag}? The ${app.service} container will briefly restart.`)) {
                          applyAppMutation.mutate(app);
                        }
                      }}
                      disabled={showSpinner || lockedByOtherApp}
                      className="inline-flex shrink-0 items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {showSpinner ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowUpCircle className="h-3 w-3" />
                      )}
                      {buttonLabel}
                    </button>
                  )}
                  {showUpToDate && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Up to date
                    </span>
                  )}
                </div>
              );
            })}
          </div>
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
