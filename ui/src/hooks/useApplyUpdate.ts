'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const CONFIRM_MESSAGE =
  'Update the dashboard? It will pull the new image and restart — this page reconnects automatically in a few seconds.';

// How long to keep probing /api/health before giving up on the new instance.
const REPLACE_TIMEOUT_MS = 180_000;
const PROBE_INTERVAL_MS = 2_000;

/**
 * Apply an update to the dashboard itself.
 *
 * The old version of this hook polled /api/updates/status, tailing a log file
 * written by a sidecar that ran `deploy.sh --update` — a git pull plus a
 * Next.js build, on the host, after stopping the running container.
 *
 * The image is now built by CI, so applying an update is a pull and a
 * recreate. There is no build to watch and no log to tail; the only question
 * is whether the new container comes back. So we poll /api/health until it
 * answers, then reload.
 *
 * Note the container is replaced underneath us, so the fetch that starts the
 * update usually does NOT get a clean response — a network error right after
 * kicking it off is the expected path, not a failure.
 */
export function useApplyUpdate(updateAvailable: boolean): {
  apply: (tag?: string) => Promise<void>;
  applying: boolean;
  running: boolean;
} {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const waitForNewInstance = useCallback(async () => {
    const deadline = Date.now() + REPLACE_TIMEOUT_MS;
    // Give the old container a moment to actually go away, so we don't
    // mistake its dying breath for the new instance being ready.
    await new Promise((r) => {
      const t = setTimeout(r, 5_000);
      timers.current.push(t);
    });

    while (Date.now() < deadline) {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          toast.success('Dashboard updated. Reloading…');
          queryClient.invalidateQueries({ queryKey: ['updates'] });
          await new Promise((r) => {
            const t = setTimeout(r, 1_000);
            timers.current.push(t);
          });
          window.location.reload();
          return;
        }
      } catch {
        // Expected while the container is being replaced.
      }
      await new Promise((r) => {
        const t = setTimeout(r, PROBE_INTERVAL_MS);
        timers.current.push(t);
      });
    }

    setRunning(false);
    toast.error(
      'The dashboard did not come back within 3 minutes. It may still be starting — ' +
        'reload to check, or see `docker logs media-ui`.',
    );
  }, [queryClient]);

  const apply = useCallback(
    async (tag?: string) => {
      if (!updateAvailable && !tag) return;
      if (!confirm(CONFIRM_MESSAGE)) return;
      setRunning(true);
      try {
        const res = await fetch('/api/updates/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tag ? { tag } : {}),
        });
        // A non-OK response here is a real refusal (bad tag, not admin) and
        // means nothing was started.
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        toast.success('Update started');
      } catch (err) {
        // The container may already be going down, in which case the request
        // never completes cleanly — that is success, not failure. Only a
        // structured error above tells us it was actually refused.
        if (err instanceof TypeError) {
          toast.success('Update started');
        } else {
          setRunning(false);
          toast.error(err instanceof Error ? err.message : 'Apply failed');
          return;
        }
      }
      void waitForNewInstance();
    },
    [updateAvailable, waitForNewInstance],
  );

  return { apply, applying: running, running };
}
