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
      </div>
    </div>
  );
}
