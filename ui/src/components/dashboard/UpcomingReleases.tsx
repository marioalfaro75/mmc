'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Film, Tv } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { formatRelativeDate, formatEpisode } from '@/lib/utils/formatters';
import type { CalendarItem } from '@/lib/types/common';

export function UpcomingReleases() {
  const start = new Date().toISOString().split('T')[0];
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, isLoading } = useQuery<CalendarItem[]>({
    queryKey: ['calendar', { start, end }],
    queryFn: () => fetch(`/api/calendar?start=${start}&end=${end}`).then(r => r.json()),
    refetchInterval: POLLING.CALENDAR,
    staleTime: STALE_TIME.CALENDAR,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Upcoming Releases
          </div>
        </CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-12 w-8 shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No upcoming releases</p>
        ) : (
          data.slice(0, 8).map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                {item.type === 'movie' ? (
                  <Film className="h-4 w-4 text-primary" />
                ) : (
                  <Tv className="h-4 w-4 text-success" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {item.type === 'episode' && (
                    <span>{formatEpisode(item.seasonNumber, item.episodeNumber)}</span>
                  )}
                  <span>{formatRelativeDate(item.airDate)}</span>
                </div>
              </div>
              <Badge variant={item.hasFile ? 'success' : 'outline'}>
                {item.hasFile ? 'Available' : 'Upcoming'}
              </Badge>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
