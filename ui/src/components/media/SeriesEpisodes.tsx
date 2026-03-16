'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight, Download, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { fetchApi } from '@/lib/utils/fetchApi';
import { formatEpisode, formatDate } from '@/lib/utils/formatters';
import { STALE_TIME } from '@/lib/utils/polling';
import type { SonarrEpisode } from '@/lib/types/sonarr';

interface SeriesEpisodesProps {
  seriesId: number;
}

export function SeriesEpisodes({ seriesId }: SeriesEpisodesProps) {
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());

  const { data: episodes, isLoading } = useQuery<SonarrEpisode[]>({
    queryKey: ['series', seriesId, 'episodes'],
    queryFn: () => fetchApi<SonarrEpisode[]>(`/api/series/${seriesId}/episodes`),
    staleTime: STALE_TIME.LIBRARY,
  });

  if (isLoading) {
    return (
      <div className="mt-4 flex items-center justify-center border-t border-border pt-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!episodes || episodes.length === 0) return null;

  const now = new Date();

  // Next episode to download: first monitored, missing, aired episode
  const nextToDownload = episodes
    .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) < now)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)[0];

  // Recently downloaded: last 5 episodes with files, by air date
  const recentlyDownloaded = episodes
    .filter(ep => ep.hasFile)
    .sort((a, b) => new Date(b.airDateUtc || 0).getTime() - new Date(a.airDateUtc || 0).getTime())
    .slice(0, 5);

  // Missing episodes: monitored, no file, already aired, grouped by season
  const missingEpisodes = episodes
    .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) < now)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);

  const missingBySeason = new Map<number, SonarrEpisode[]>();
  for (const ep of missingEpisodes) {
    const list = missingBySeason.get(ep.seasonNumber) || [];
    list.push(ep);
    missingBySeason.set(ep.seasonNumber, list);
  }

  // Upcoming: monitored episodes airing in the future
  const upcoming = episodes
    .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) >= now)
    .sort((a, b) => new Date(a.airDateUtc).getTime() - new Date(b.airDateUtc).getTime())
    .slice(0, 3);

  const toggleSeason = (season: number) => {
    setExpandedSeasons(prev => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };

  const hasContent = nextToDownload || recentlyDownloaded.length > 0 || missingEpisodes.length > 0 || upcoming.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      {/* Next episode to download */}
      {nextToDownload && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
            Next to Download
          </h4>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-primary">
              {formatEpisode(nextToDownload.seasonNumber, nextToDownload.episodeNumber)}
            </span>
            <span className="ml-2">{nextToDownload.title}</span>
            {nextToDownload.airDate && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({formatDate(nextToDownload.airDate)})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Upcoming episodes */}
      {upcoming.length > 0 && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Upcoming
          </h4>
          <div className="space-y-1">
            {upcoming.map(ep => (
              <div key={ep.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {formatEpisode(ep.seasonNumber, ep.episodeNumber)}
                </span>
                <span className="flex-1 truncate">{ep.title}</span>
                {ep.airDate && (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(ep.airDate)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently downloaded */}
      {recentlyDownloaded.length > 0 && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-success" />
            Recently Downloaded
          </h4>
          <div className="space-y-1">
            {recentlyDownloaded.map(ep => (
              <div key={ep.id} className="flex items-center gap-2 rounded-md px-3 py-1 text-sm">
                <span className="font-mono text-xs text-success">
                  {formatEpisode(ep.seasonNumber, ep.episodeNumber)}
                </span>
                <span className="flex-1 truncate text-muted-foreground">{ep.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing episodes */}
      {missingEpisodes.length > 0 && (
        <div>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            Missing
            <Badge variant="danger">{missingEpisodes.length}</Badge>
          </h4>
          <div className="space-y-0.5">
            {Array.from(missingBySeason.entries())
              .sort(([a], [b]) => a - b)
              .map(([season, eps]) => (
                <div key={season}>
                  <button
                    onClick={() => toggleSeason(season)}
                    className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                  >
                    {expandedSeasons.has(season) ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>Season {season}</span>
                    <Badge variant="danger" className="ml-auto">{eps.length}</Badge>
                  </button>
                  {expandedSeasons.has(season) && (
                    <div className="ml-6 space-y-0.5">
                      {eps.map(ep => (
                        <div key={ep.id} className="flex items-center gap-2 px-3 py-1 text-sm text-muted-foreground">
                          <span className="font-mono text-xs">
                            {formatEpisode(ep.seasonNumber, ep.episodeNumber)}
                          </span>
                          <span className="flex-1 truncate">{ep.title}</span>
                          {ep.airDate && (
                            <span className="shrink-0 text-xs">{formatDate(ep.airDate)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
