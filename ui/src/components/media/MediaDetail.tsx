'use client';

import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { formatBytes, formatDate } from '@/lib/utils/formatters';

interface MediaDetailProps {
  open: boolean;
  onClose: () => void;
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string | null;
  monitored?: boolean;
  hasFile?: boolean;
  sizeOnDisk?: number;
  path?: string;
  added?: string;
  genres?: string[];
  runtime?: number;
  certification?: string;
}

export function MediaDetail({
  open,
  onClose,
  title,
  year,
  overview,
  posterUrl,
  monitored,
  hasFile,
  sizeOnDisk,
  path,
  added,
  genres,
  runtime,
  certification,
}: MediaDetailProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-2xl">
      <div className="flex gap-4">
        {posterUrl && (
          <div className="w-32 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterUrl}
              alt={title}
              className="w-full rounded-md"
            />
          </div>
        )}
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {year && <Badge variant="outline">{year}</Badge>}
            {certification && <Badge variant="outline">{certification}</Badge>}
            {runtime && <Badge variant="outline">{runtime} min</Badge>}
            {monitored !== undefined && (
              <Badge variant={monitored ? 'success' : 'warning'}>
                {monitored ? 'Monitored' : 'Unmonitored'}
              </Badge>
            )}
            {hasFile !== undefined && (
              <Badge variant={hasFile ? 'success' : 'danger'}>
                {hasFile ? 'On Disk' : 'Missing'}
              </Badge>
            )}
          </div>
          {overview && (
            <p className="text-sm text-muted-foreground">{overview}</p>
          )}
          {genres && genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {genres.map((g) => (
                <Badge key={g} variant="outline">{g}</Badge>
              ))}
            </div>
          )}
          <div className="space-y-1 text-xs text-muted-foreground">
            {sizeOnDisk !== undefined && sizeOnDisk > 0 && (
              <p>Size: {formatBytes(sizeOnDisk)}</p>
            )}
            {path && <p>Path: {path}</p>}
            {added && <p>Added: {formatDate(added)}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
