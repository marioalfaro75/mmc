'use client';

import { DownloadItemRow } from './DownloadItem';
import { Skeleton } from '@/components/common/Skeleton';
import type { DownloadItem } from '@/lib/types/common';

type TabKey = 'active' | 'completed' | 'failed';

interface DownloadQueueProps {
  items: DownloadItem[];
  isLoading: boolean;
  activeTab: TabKey;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function DownloadQueue({ items, isLoading, activeTab, onPause, onResume, onDelete }: DownloadQueueProps) {
  const filtered = items.filter((item) => {
    switch (activeTab) {
      case 'active': return ['downloading', 'paused', 'queued', 'extracting'].includes(item.status);
      case 'completed': return ['completed', 'seeding'].includes(item.status);
      case 'failed': return item.status === 'failed';
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3">
            <Skeleton className="mb-2 h-4 w-3/4" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No {activeTab} downloads
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((item) => (
        <DownloadItemRow
          key={item.id}
          item={item}
          onPause={onPause}
          onResume={onResume}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
