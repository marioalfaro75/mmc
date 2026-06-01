'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchApi } from '@/lib/utils/fetchApi';

export interface UpdateStatusResponse {
  running: boolean;
  jobId?: string;
  startedAt?: string;
  logBytes?: number;
  logTail?: string;
  error?: string;
}

const STATUS_POLL_MS = 2000;

const CONFIRM_MESSAGE =
  'Apply the available update? The dashboard will briefly disconnect while the new image is built and media-ui is recreated.';

// Shared apply-update behaviour for the Settings → Updates tab and the
// global UpdateBanner. Keeps confirm text, status polling, post-apply
// reload, and toasts in lockstep across both surfaces.
//
// `updateAvailable` is passed in so this hook doesn't double-fetch the
// /api/updates/check payload — the caller already has it.
export function useApplyUpdate(updateAvailable: boolean): {
  apply: () => Promise<void>;
  applying: boolean;
  running: boolean;
  status: UpdateStatusResponse | undefined;
} {
  const queryClient = useQueryClient();
  const [applying, setApplying] = useState(false);

  const statusQuery = useQuery<UpdateStatusResponse>({
    queryKey: ['updates', 'status'],
    queryFn: () => fetchApi<UpdateStatusResponse>('/api/updates/status'),
    refetchInterval: (q) => (q.state.data?.running || applying ? STATUS_POLL_MS : false),
    refetchIntervalInBackground: true,
  });

  // running: true → false transition means the job finished. Refresh the
  // check (the new local SHA will match the remote) and reload — the
  // running media-ui process was just rebuilt under us.
  const previousRunning = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const running = statusQuery.data?.running;
    if (previousRunning.current === true && running === false) {
      toast.success('Update finished. Refreshing version info…');
      queryClient.invalidateQueries({ queryKey: ['updates', 'check'] });
      setTimeout(() => window.location.reload(), 2000);
    }
    previousRunning.current = running;
  }, [statusQuery.data?.running, queryClient]);

  const apply = useCallback(async () => {
    if (!updateAvailable) return;
    if (!confirm(CONFIRM_MESSAGE)) return;
    setApplying(true);
    try {
      const res = await fetch('/api/updates/apply', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast.success('Update started');
      queryClient.invalidateQueries({ queryKey: ['updates', 'status'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Apply failed');
      setApplying(false);
    }
  }, [updateAvailable, queryClient]);

  return {
    apply,
    applying,
    running: statusQuery.data?.running ?? false,
    status: statusQuery.data,
  };
}
