'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, HardDrive, Wifi } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import { formatBytes, formatSpeed, formatDuration } from '@/lib/utils/formatters';
import type { DownloadItem } from '@/lib/types/common';

interface DownloadsResponse {
  items: DownloadItem[];
  clients: { torrent: boolean; usenet: boolean };
}

export function ActiveDownloads() {
  const { data, isLoading } = useQuery<DownloadsResponse>({
    queryKey: ['downloads'],
    queryFn: () => fetchApi<DownloadsResponse>('/api/downloads'),
    refetchInterval: POLLING.DOWNLOADS,
    staleTime: STALE_TIME.DOWNLOADS,
  });

  const active = data?.items?.filter(d => d.status === 'downloading' || d.status === 'queued') ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Active Downloads
          </div>
        </CardTitle>
        <Badge variant="outline">{active.length}</Badge>
      </CardHeader>
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active downloads</p>
        ) : (
          active.slice(0, 5).map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm">{item.name}</p>
                <Badge variant={item.source === 'torrent' ? 'default' : 'warning'}>
                  {item.source === 'torrent' ? <HardDrive className="mr-1 h-3 w-3" /> : <Wifi className="mr-1 h-3 w-3" />}
                  {item.source}
                </Badge>
              </div>
              <ProgressBar value={item.progress} showLabel />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatSpeed(item.speedBytesPerSecond)}</span>
                <span>{formatBytes(item.downloadedBytes)} / {formatBytes(item.sizeBytes)}</span>
                <span>ETA: {formatDuration(item.etaSeconds)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
