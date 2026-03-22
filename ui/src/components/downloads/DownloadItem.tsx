'use client';

import { useState } from 'react';
import { Pause, Play, Trash2, HardDrive, Wifi, Zap, AlertTriangle, Ban, Search } from 'lucide-react';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Badge } from '@/components/common/Badge';
import { formatBytes, formatSpeed, formatDuration } from '@/lib/utils/formatters';
import type { DownloadItem as DownloadItemType } from '@/lib/types/common';

interface DownloadItemProps {
  item: DownloadItemType;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onForceStart?: (id: string) => void;
  onDelete?: (id: string, deleteFiles: boolean) => void;
  onBlocklist?: (item: DownloadItemType) => void;
  onBlocklistAndSearch?: (item: DownloadItemType) => void;
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  downloading: 'default',
  seeding: 'warning',
  completed: 'success',
  paused: 'outline' as 'default',
  queued: 'outline' as 'default',
  failed: 'danger',
  extracting: 'warning',
  warning: 'warning',
};

export function DownloadItemRow({ item, onPause, onResume, onForceStart, onDelete, onBlocklist, onBlocklistAndSearch }: DownloadItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const canPause = item.status === 'downloading';
  const canResume = item.status === 'paused';
  const canForceStart = item.status === 'queued' || item.status === 'paused';
  const isWarning = item.status === 'warning';

  return (
    <div className={`rounded-lg border bg-card p-3 ${isWarning ? 'border-warning/50' : 'border-border'}`}>
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
            <Badge variant={statusVariant[item.status] || 'default'}>
              {isWarning ? 'import blocked' : item.status}
            </Badge>
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
          {isWarning ? (
            <>
              {onBlocklist && (
                <button
                  onClick={() => onBlocklist(item)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-warning/20 hover:text-warning transition-colors"
                  title="Blocklist — remove and prevent re-download"
                >
                  <Ban className="h-4 w-4" />
                </button>
              )}
              {onBlocklistAndSearch && (
                <button
                  onClick={() => onBlocklistAndSearch(item)}
                  className="flex items-center gap-0.5 rounded p-1.5 text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                  title="Blocklist and search for replacement"
                >
                  <Ban className="h-4 w-4" />
                  <Search className="h-4 w-4" />
                </button>
              )}
            </>
          ) : (
            <>
              {canPause && onPause && (
                <button
                  onClick={() => onPause(item.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Pause"
                >
                  <Pause className="h-4 w-4" />
                </button>
              )}
              {canResume && onResume && (
                <button
                  onClick={() => onResume(item.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Resume"
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
              {canForceStart && onForceStart && (
                <button
                  onClick={() => onForceStart(item.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-warning/20 hover:text-warning transition-colors"
                  title="Force start — bypass queue limits"
                >
                  <Zap className="h-4 w-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-danger/20 hover:text-danger transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Warning messages */}
      {item.warnings && item.warnings.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {item.warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        </div>
      )}

      <ProgressBar
        value={item.progress}
        className="mt-2"
        variant={item.status === 'completed' || item.status === 'seeding' ? 'success' : item.status === 'failed' || isWarning ? 'danger' : 'default'}
        showLabel
      />
      {showDeleteConfirm && (
        <div className="mt-2 flex items-center justify-between rounded-md border border-danger/30 bg-danger/5 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Remove this download?</p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="rounded border-border"
              />
              Also delete files from disk
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowDeleteConfirm(false); setDeleteFiles(false); }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => { onDelete?.(item.id, deleteFiles); setShowDeleteConfirm(false); setDeleteFiles(false); }}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger/80"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
