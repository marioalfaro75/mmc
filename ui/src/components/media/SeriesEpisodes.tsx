'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, ChevronDown, ChevronRight, Download, AlertCircle,
  Clock, CheckCircle2, XCircle, List,
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { fetchApi } from '@/lib/utils/fetchApi';
import { formatEpisode, formatDate } from '@/lib/utils/formatters';
import { STALE_TIME } from '@/lib/utils/polling';
import type { SonarrEpisode } from '@/lib/types/sonarr';

interface SeriesEpisodesProps {
  seriesId: number;
}

type ViewMode = 'summary' | 'all';

export function SeriesEpisodes({ seriesId }: SeriesEpisodesProps) {
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('all');

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

  const toggleSeason = (season: number) => {
    setExpandedSeasons(prev => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };

  // Group all episodes by season (excluding specials S00)
  const allBySeason = new Map<number, SonarrEpisode[]>();
  for (const ep of episodes) {
    if (ep.seasonNumber === 0) continue;
    const list = allBySeason.get(ep.seasonNumber) || [];
    list.push(ep);
    allBySeason.set(ep.seasonNumber, list);
  }

  // Summary view data
  const nextToDownload = episodes
    .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) < now)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)[0];

  const upcoming = episodes
    .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) >= now)
    .sort((a, b) => new Date(a.airDateUtc).getTime() - new Date(b.airDateUtc).getTime())
    .slice(0, 3);

  const missingEpisodes = episodes
    .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) < now)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);

  const missingBySeason = new Map<number, SonarrEpisode[]>();
  for (const ep of missingEpisodes) {
    const list = missingBySeason.get(ep.seasonNumber) || [];
    list.push(ep);
    missingBySeason.set(ep.seasonNumber, list);
  }

  const recentlyDownloaded = episodes
    .filter(ep => ep.hasFile)
    .sort((a, b) => new Date(b.airDateUtc || 0).getTime() - new Date(a.airDateUtc || 0).getTime())
    .slice(0, 5);

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      {/* View toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('all')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <List className="h-3.5 w-3.5" />
          All Episodes
        </button>
        <button
          onClick={() => setViewMode('summary')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            viewMode === 'summary' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <Download className="h-3.5 w-3.5" />
          Summary
        </button>
      </div>

      {viewMode === 'all' ? (
        /* All episodes view */
        <div className="space-y-1">
          {Array.from(allBySeason.entries())
            .sort(([a], [b]) => a - b)
            .map(([season, eps]) => {
              const sorted = eps.sort((a, b) => a.episodeNumber - b.episodeNumber);
              const haveCount = sorted.filter(e => e.hasFile).length;
              return (
                <div key={season}>
                  <button
                    onClick={() => toggleSeason(season)}
                    className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                  >
                    {expandedSeasons.has(season) ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-medium">Season {season}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{haveCount}/{sorted.length}</span>
                      {haveCount === sorted.length ? (
                        <Badge variant="success">Complete</Badge>
                      ) : haveCount > 0 ? (
                        <Badge variant="warning">{sorted.length - haveCount} missing</Badge>
                      ) : (
                        <Badge variant="danger">No files</Badge>
                      )}
                    </span>
                  </button>
                  {expandedSeasons.has(season) && (
                    <div className="ml-3 space-y-0.5 border-l-2 border-border pl-3">
                      {sorted.map(ep => {
                        const aired = ep.airDateUtc && new Date(ep.airDateUtc) < now;
                        return (
                          <div key={ep.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                            {ep.hasFile ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                            ) : aired ? (
                              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="font-mono text-xs text-muted-foreground shrink-0">
                              {formatEpisode(ep.seasonNumber, ep.episodeNumber)}
                            </span>
                            <span className={`flex-1 truncate ${ep.hasFile ? '' : 'text-muted-foreground'}`}>
                              {ep.title}
                            </span>
                            {ep.airDate && (
                              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(ep.airDate)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        /* Summary view */
        <>
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
        </>
      )}
    </div>
  );
}
