'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, ChevronDown, ChevronRight, Download, AlertCircle,
  Clock, CheckCircle2, XCircle, List, Search, Eye, EyeOff,
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { fetchApi } from '@/lib/utils/fetchApi';
import { formatEpisode, formatDate } from '@/lib/utils/formatters';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { toast } from 'sonner';
import type { SonarrEpisode, SonarrSeries, SonarrQueueItem } from '@/lib/types/sonarr';

interface SeriesEpisodesProps {
  seriesId: number;
  seriesTitle: string;
}

type ViewMode = 'summary' | 'all';

export function SeriesEpisodes({ seriesId, seriesTitle }: SeriesEpisodesProps) {
  const queryClient = useQueryClient();
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const { data: episodes, isLoading } = useQuery<SonarrEpisode[]>({
    queryKey: ['series', seriesId, 'episodes'],
    queryFn: () => fetchApi<SonarrEpisode[]>(`/api/series/${seriesId}/episodes`),
    staleTime: STALE_TIME.LIBRARY,
  });

  const { data: seriesData } = useQuery<SonarrSeries>({
    queryKey: ['series', seriesId],
    queryFn: () => fetchApi<SonarrSeries>(`/api/series/${seriesId}`),
    staleTime: STALE_TIME.LIBRARY,
  });

  // Poll queue for this series to show download indicators
  const { data: queueData } = useQuery<{ records: SonarrQueueItem[] }>({
    queryKey: ['series', seriesId, 'queue'],
    queryFn: () => fetchApi<{ records: SonarrQueueItem[] }>(`/api/series/queue?seriesId=${seriesId}`),
    refetchInterval: POLLING.DOWNLOADS,
    staleTime: STALE_TIME.DOWNLOADS,
  });

  const downloadingEpisodeIds = new Set(
    queueData?.records?.map(r => r.episodeId) ?? []
  );

  // Per-series search for missing episodes using targeted EpisodeSearch
  const searchSeriesMutation = useMutation({
    mutationFn: async () => {
      const eps = await fetchApi<SonarrEpisode[]>(`/api/series/${seriesId}/episodes`);
      const now = new Date();
      const missingIds = eps
        .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) < now)
        .map(ep => ep.id);
      if (missingIds.length === 0) throw new Error('No missing episodes to search for');
      return fetchApi('/api/series/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'EpisodeSearch', episodeIds: missingIds }),
      });
    },
    onSuccess: () => toast.success(`Searching for missing episodes of "${seriesTitle}"...`),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to start search'),
  });

  // Toggle season monitoring
  const toggleSeasonMutation = useMutation({
    mutationFn: async ({ seasonNumber, monitored }: { seasonNumber: number; monitored: boolean }) => {
      const fresh = await fetchApi<SonarrSeries>(`/api/series/${seriesId}`);
      const updated = {
        ...fresh,
        seasons: fresh.seasons.map(s =>
          s.seasonNumber === seasonNumber ? { ...s, monitored } : s
        ),
      };
      return fetchApi<SonarrSeries>(`/api/series/${seriesId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    },
    onSuccess: (_data, { seasonNumber, monitored }) => {
      queryClient.invalidateQueries({ queryKey: ['series', seriesId] });
      queryClient.invalidateQueries({ queryKey: ['series', seriesId, 'episodes'] });
      queryClient.invalidateQueries({ queryKey: ['series'] });
      toast.success(`Season ${seasonNumber} ${monitored ? 'monitored' : 'unmonitored'}`);
    },
    onError: () => toast.error('Failed to update season monitoring'),
  });

  // Monitor all seasons and search
  const monitorAllAndSearchMutation = useMutation({
    mutationFn: async () => {
      const fresh = await fetchApi<SonarrSeries>(`/api/series/${seriesId}`);
      const updated = {
        ...fresh,
        seasons: fresh.seasons.map(s => ({ ...s, monitored: true })),
      };
      await fetchApi<SonarrSeries>(`/api/series/${seriesId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      await fetchApi('/api/series/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'SeriesSearch', seriesId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series', seriesId] });
      queryClient.invalidateQueries({ queryKey: ['series', seriesId, 'episodes'] });
      queryClient.invalidateQueries({ queryKey: ['series'] });
      toast.success(`All seasons monitored — searching for missing episodes of "${seriesTitle}"...`);
    },
    onError: () => toast.error('Failed to monitor and search'),
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
    .filter(ep => ep.monitored && !ep.hasFile && !downloadingEpisodeIds.has(ep.id) && ep.airDateUtc && new Date(ep.airDateUtc) < now)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)[0];

  const upcoming = episodes
    .filter(ep => ep.monitored && !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) >= now)
    .sort((a, b) => new Date(a.airDateUtc).getTime() - new Date(b.airDateUtc).getTime())
    .slice(0, 3);

  const missingEpisodes = episodes
    .filter(ep => ep.monitored && !ep.hasFile && !downloadingEpisodeIds.has(ep.id) && ep.airDateUtc && new Date(ep.airDateUtc) < now)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);

  const downloadingEpisodes = episodes
    .filter(ep => !ep.hasFile && downloadingEpisodeIds.has(ep.id))
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

  const hasUnmonitoredSeasons = seriesData?.seasons?.some(
    s => s.seasonNumber > 0 && !s.monitored
  );

  const isAnyMutationPending =
    searchSeriesMutation.isPending ||
    monitorAllAndSearchMutation.isPending ||
    toggleSeasonMutation.isPending;

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      {/* View toggle and action buttons */}
      <div className="flex flex-wrap items-center gap-2">
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

        <div className="ml-auto flex items-center gap-2">
          {hasUnmonitoredSeasons && (
            <button
              onClick={() => monitorAllAndSearchMutation.mutate()}
              disabled={isAnyMutationPending}
              title="Monitor all seasons and search for missing episodes"
              className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {monitorAllAndSearchMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <Search className="h-3.5 w-3.5" />
                </>
              )}
              Monitor All & Search
            </button>
          )}
          {missingEpisodes.length > 0 && (
            <button
              onClick={() => searchSeriesMutation.mutate()}
              disabled={isAnyMutationPending}
              title="Search for missing episodes of this series"
              className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {searchSeriesMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Search Missing ({missingEpisodes.length})
            </button>
          )}
        </div>
      </div>

      {viewMode === 'all' ? (
        /* All episodes view */
        <div className="space-y-1">
          {Array.from(allBySeason.entries())
            .sort(([a], [b]) => a - b)
            .map(([season, eps]) => {
              const sorted = eps.sort((a, b) => a.episodeNumber - b.episodeNumber);
              const haveCount = sorted.filter(e => e.hasFile).length;
              const downloadingCount = sorted.filter(e => !e.hasFile && downloadingEpisodeIds.has(e.id)).length;
              const seasonData = seriesData?.seasons?.find(s => s.seasonNumber === season);
              const isMonitored = seasonData?.monitored ?? true;
              return (
                <div key={season}>
                  <div className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSeasonMutation.mutate({
                          seasonNumber: season,
                          monitored: !isMonitored,
                        });
                      }}
                      disabled={toggleSeasonMutation.isPending}
                      className="p-0.5 rounded hover:bg-muted transition-colors"
                      title={isMonitored ? 'Unmonitor season' : 'Monitor season'}
                    >
                      {isMonitored ? (
                        <Eye className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => toggleSeason(season)}
                      className="flex flex-1 items-center gap-1.5"
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
                        ) : (sorted.length - haveCount - downloadingCount) > 0 ? (
                          <Badge variant="warning">{sorted.length - haveCount - downloadingCount} missing</Badge>
                        ) : downloadingCount > 0 ? (
                          null
                        ) : (
                          <Badge variant="danger">No files</Badge>
                        )}
                        {downloadingCount > 0 && (
                          <Badge variant="default">{downloadingCount} downloading</Badge>
                        )}
                        {!isMonitored && <Badge variant="outline">Unmonitored</Badge>}
                      </span>
                    </button>
                  </div>
                  {expandedSeasons.has(season) && (
                    <div className="ml-3 space-y-0.5 border-l-2 border-border pl-3">
                      {sorted.map(ep => {
                        const aired = ep.airDateUtc && new Date(ep.airDateUtc) < now;
                        const isDownloading = downloadingEpisodeIds.has(ep.id);
                        return (
                          <div key={ep.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                            {ep.hasFile ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                            ) : isDownloading ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 text-primary animate-spin" />
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
                              {downloadingEpisodeIds.has(ep.id) && (
                                <Loader2 className="h-3 w-3 shrink-0 text-primary animate-spin" />
                              )}
                              <span className="font-mono text-xs">
                                {formatEpisode(ep.seasonNumber, ep.episodeNumber)}
                              </span>
                              <span className="flex-1 truncate">{ep.title}</span>
                              {downloadingEpisodeIds.has(ep.id) ? (
                                <Badge variant="default" className="shrink-0 text-xs">Downloading</Badge>
                              ) : ep.airDate ? (
                                <span className="shrink-0 text-xs">{formatDate(ep.airDate)}</span>
                              ) : null}
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
