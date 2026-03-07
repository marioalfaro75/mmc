'use client';

import { Pause, Play, Trash2, HardDrive, Wifi } from 'lucide-react';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Badge } from '@/components/common/Badge';
import { formatBytes, formatSpeed, formatDuration } from '@/lib/utils/formatters';
import type { DownloadItem as DownloadItemType } from '@/lib/types/common';

interface DownloadItemProps {
  item: DownloadItemType;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  downloading: 'default',
  seeding: 'warning',
  completed: 'success',
  paused: 'outline' as 'default',
  queued: 'outline' as 'default',
  failed: 'danger',
  extracting: 'warning',
};

export function DownloadItemRow({ item, onPause, onResume, onDelete }: DownloadItemProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {item.source === 'torrent' ? (
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Wifi className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <p className="truncate text-sm font-medium">{item.name}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={statusVariant[item.status] || 'default'}>{item.status}</Badge>
            <Badge variant="outline">{item.category}</Badge>
            <span>{formatBytes(item.downloadedBytes)} / {formatBytes(item.sizeBytes)}</span>
            {item.speedBytesPerSecond > 0 && <span>{formatSpeed(item.speedBytesPerSecond)}</span>}
            {item.etaSeconds !== null && <span>ETA: {formatDuration(item.etaSeconds)}</span>}
            {item.seeds !== null && <span>Seeds: {item.seeds}</span>}
            {item.peers !== null && <span>Peers: {item.peers}</span>}
            {item.ratio !== null && <span>Ratio: {item.ratio.toFixed(2)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {item.status === 'downloading' && onPause && (
            <button
              onClick={() => onPause(item.id)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Pause"
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
          {item.status === 'paused' && onResume && (
            <button
              onClick={() => onResume(item.id)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Resume"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(item.id)}
              className="rounded p-1.5 text-muted-foreground hover:bg-danger/20 hover:text-danger transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <ProgressBar
        value={item.progress}
        className="mt-2"
        variant={item.status === 'completed' || item.status === 'seeding' ? 'success' : item.status === 'failed' ? 'danger' : 'default'}
        showLabel
      />
    </div>
  );
}
