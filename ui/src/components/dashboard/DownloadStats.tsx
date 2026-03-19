'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, CheckCircle2, XCircle, Tv, Film, Calendar, AlertTriangle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import { formatRelativeDate, formatBytes } from '@/lib/utils/formatters';

interface HistoryItem {
  id: number;
  type: 'episode' | 'movie';
  title: string;
  date: string;
  eventType: 'imported' | 'failed';
  quality: string;
  size: number | null;
}

interface HistoryResponse {
  stats: {
    importedToday: number;
    importedWeek: number;
    failed: number;
  };
  recent: HistoryItem[];
}

export function DownloadStats() {
  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ['dashboard-history'],
    queryFn: () => fetchApi<HistoryResponse>('/api/dashboard/history'),
    refetchInterval: POLLING.LIBRARY,
    staleTime: STALE_TIME.LIBRARY,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Download Stats
          </div>
        </CardTitle>
      </CardHeader>
      <div className="space-y-4">
        {/* Stats row */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold">{data.stats.importedToday}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold">{data.stats.importedWeek}</p>
              <p className="text-xs text-muted-foreground">This Week</p>
            </div>
            <div className={`rounded-md p-3 text-center ${data.stats.failed > 0 ? 'bg-red-500/10' : 'bg-muted/50'}`}>
              <p className={`text-2xl font-bold ${data.stats.failed > 0 ? 'text-red-500' : ''}`}>{data.stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        ) : null}

        {/* Recent history */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : data?.recent && data.recent.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">Recently Completed</p>
            {data.recent.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/30 transition-colors">
                {item.eventType === 'imported' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                {item.type === 'episode' ? (
                  <Tv className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Film className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeDate(item.date)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No download history yet</p>
        )}
      </div>
    </Card>
  );
}
