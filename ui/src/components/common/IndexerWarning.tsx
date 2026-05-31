'use client';

import { AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useBrowserHost } from '@/lib/useBrowserHost';
import { fetchApi } from '@/lib/utils/fetchApi';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';

// Surfaces the "Prowlarr connected but no indexers added" gap. Quick Setup
// only wires Sonarr/Radarr as *applications* — the user still has to add
// the actual trackers/usenet providers in Prowlarr → Indexers, and without
// them Sonarr/Radarr will accept requests but never find anything to grab.
//
// Renders only when we successfully got a count of 0. If Prowlarr is
// unreachable (count === null) we suppress — that's a different problem
// surfaced elsewhere and double-warning the user is noise.
export function IndexerWarning() {
  const host = useBrowserHost();
  const { data } = useQuery<{ count: number | null }>({
    queryKey: ['prowlarr-indexers'],
    queryFn: () => fetchApi<{ count: number | null }>('/api/prowlarr/indexers'),
    refetchInterval: POLLING.HEALTH,
    staleTime: STALE_TIME.HEALTH,
  });

  if (!data || data.count === null || data.count > 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">No indexers configured in Prowlarr</p>
        <p className="mt-0.5 text-xs">
          Requests will be approved but downloads will never find anything to grab.
          Open{' '}
          <a
            href={`http://${host}:9696`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-warning/80"
          >
            Prowlarr → Indexers → Add Indexer
          </a>{' '}
          and configure at least one tracker or Usenet provider.
        </p>
      </div>
    </div>
  );
}
