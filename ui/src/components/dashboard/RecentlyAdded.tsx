'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { PlexMediaItem } from '@/lib/api/plex';

export function RecentlyAdded() {
  const { data, isLoading, isError } = useQuery<PlexMediaItem[]>({
    queryKey: ['recently-added'],
    queryFn: () => fetchApi<PlexMediaItem[]>('/api/recently-added'),
    refetchInterval: POLLING.RECENTLY_ADDED,
    staleTime: STALE_TIME.RECENTLY_ADDED,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recently Added
          </div>
        </CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Plex unavailable</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No recent additions</p>
        ) : (
          data.slice(0, 10).map((item) => {
            const title = item.grandparentTitle
              ? `${item.grandparentTitle} - ${item.title}`
              : item.title;
            return (
              <div key={item.ratingKey} className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                  {item.type === 'movie' ? 'MOV' : 'EP'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.year || ''}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
