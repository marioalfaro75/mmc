'use client';

import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { formatBytes, formatDate, formatRelativeDate } from '@/lib/utils/formatters';

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
  seriesStatus?: string;
  network?: string;
  nextAiring?: string;
  episodeStats?: { fileCount: number; totalCount: number; percent: number };
  seasons?: { seasonNumber: number; monitored: boolean; statistics: { episodeFileCount: number; episodeCount: number; percentOfEpisodes: number } }[];
  children?: React.ReactNode;
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
  seriesStatus,
  network,
  nextAiring,
  episodeStats,
  seasons,
  children,
}: MediaDetailProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-3xl">
      <div className="max-h-[70vh] overflow-y-auto">
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
            {seriesStatus && (
              <Badge variant={seriesStatus === 'continuing' ? 'success' : 'outline'}>
                {seriesStatus === 'continuing' ? 'Continuing' : 'Ended'}
              </Badge>
            )}
            {network && <Badge variant="outline">{network}</Badge>}
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
          {episodeStats && episodeStats.totalCount > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {episodeStats.fileCount} of {episodeStats.totalCount} episodes
                </span>
                <span className="text-xs text-muted-foreground">{Math.round(episodeStats.percent)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${episodeStats.percent}%` }}
                />
              </div>
            </div>
          )}
          {seasons && seasons.filter(s => s.seasonNumber > 0).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Seasons</p>
              {seasons
                .filter(s => s.seasonNumber > 0)
                .sort((a, b) => a.seasonNumber - b.seasonNumber)
                .map(season => (
                  <div key={season.seasonNumber} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-muted-foreground">Season {season.seasonNumber}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-primary transition-all"
                        style={{ width: `${season.statistics?.percentOfEpisodes || 0}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-muted-foreground">
                      {season.statistics?.episodeFileCount || 0}/{season.statistics?.episodeCount || 0}
                    </span>
                  </div>
                ))}
            </div>
          )}
          {nextAiring && (
            <p className="text-sm text-muted-foreground">
              Next airing: {formatRelativeDate(nextAiring)}
            </p>
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
      {children}
      </div>
    </Modal>
  );
}
