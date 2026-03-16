'use client';

import { Badge } from '@/components/common/Badge';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  title: string;
  year?: number;
  posterUrl?: string | null;
  monitored?: boolean;
  hasFile?: boolean;
  subtitle?: string;
  episodeProgress?: { have: number; total: number };
  onClick?: () => void;
  className?: string;
}

export function MediaCard({
  title,
  year,
  posterUrl,
  monitored = true,
  hasFile = false,
  subtitle,
  episodeProgress,
  onClick,
  className,
}: MediaCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg',
        className
      )}
    >
      <div className="relative aspect-[2/3] bg-muted">
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No Poster
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1">
          {!monitored && <Badge variant="outline">Unmonitored</Badge>}
          {hasFile && <Badge variant="success">Available</Badge>}
        </div>
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {year && <span>{year}</span>}
          {subtitle && <span>{subtitle}</span>}
        </div>
        {episodeProgress && episodeProgress.total > 0 && (
          <div className="mt-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
              <span>{episodeProgress.have}/{episodeProgress.total} episodes</span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((episodeProgress.have / Math.max(episodeProgress.total, 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
