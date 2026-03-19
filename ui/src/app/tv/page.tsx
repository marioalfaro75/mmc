'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Loader2 } from 'lucide-react';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaGrid } from '@/components/media/MediaGrid';
import { MediaDetail } from '@/components/media/MediaDetail';
import { SeriesEpisodes } from '@/components/media/SeriesEpisodes';
import { SearchBar } from '@/components/media/SearchBar';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi, ApiError } from '@/lib/utils/fetchApi';
import type { SonarrSeries, SonarrLookupResult } from '@/lib/types/sonarr';
import { toast } from 'sonner';

type FilterKey = 'all' | 'monitored' | 'continuing' | 'ended' | 'missing';
type SortKey = 'title' | 'year' | 'added' | 'episodes';

async function pollForDownload(seriesId: number, title: string) {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const data = await fetchApi<{ records: { seriesId: number }[] }>(`/api/series/queue?seriesId=${seriesId}`);
      if (data.records?.length > 0) {
        toast.success(`Download found for "${title}"`);
        return;
      }
    } catch { /* keep polling */ }
  }
  toast.warning(`No download found yet for "${title}" — it will be retried automatically every 6 hours`);
}

export default function TvPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('title');
  const [selectedSeries, setSelectedSeries] = useState<SonarrSeries | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [lookupTerm, setLookupTerm] = useState('');
  const addedTitle = useRef('');

  const { data: series, isLoading, isError, error } = useQuery<SonarrSeries[]>({
    queryKey: ['series'],
    queryFn: () => fetchApi<SonarrSeries[]>('/api/series'),
    staleTime: STALE_TIME.LIBRARY,
    refetchInterval: POLLING.LIBRARY,
  });

  const { data: lookupResults } = useQuery<SonarrLookupResult[]>({
    queryKey: ['series', 'lookup', lookupTerm],
    queryFn: () => fetchApi<SonarrLookupResult[]>(`/api/series/lookup?term=${encodeURIComponent(lookupTerm)}`),
    enabled: lookupTerm.length > 2,
  });

  const addMutation = useMutation({
    mutationFn: (s: Partial<SonarrSeries>) => {
      addedTitle.current = s.title || '';
      return fetchApi<SonarrSeries>('/api/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    },
    onSuccess: (data: SonarrSeries) => {
      queryClient.invalidateQueries({ queryKey: ['series'] });
      setShowAdd(false);
      toast.info(`"${addedTitle.current}" added — searching for downloads...`);
      pollForDownload(data.id, addedTitle.current);
    },
    onError: () => toast.error('Failed to add series'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, deleteFiles }: { id: number; deleteFiles: boolean }) =>
      fetchApi(`/api/series?id=${id}&deleteFiles=${deleteFiles}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series'] });
      setSelectedSeries(null);
      toast.success('Series removed');
    },
    onError: () => toast.error('Failed to remove series'),
  });

  const searchMissingMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/series/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'MissingEpisodeSearch' }),
      }),
    onSuccess: () => toast.success('Searching for all missing episodes...'),
    onError: () => toast.error('Failed to start missing episode search'),
  });

  const handleSearch = useCallback((q: string) => setSearch(q), []);

  const missingCount = (series || []).filter(s => s.monitored && (s.statistics?.percentOfEpisodes ?? 0) < 100).length;

  const filtered = (series || [])
    .filter((s) => {
      if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'monitored' && !s.monitored) return false;
      if (filter === 'continuing' && s.status !== 'continuing') return false;
      if (filter === 'ended' && s.status !== 'ended') return false;
      if (filter === 'missing' && s.statistics?.percentOfEpisodes >= 100) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case 'year': return (b.year || 0) - (a.year || 0);
        case 'added': return new Date(b.added).getTime() - new Date(a.added).getTime();
        case 'episodes': return (b.statistics?.episodeCount || 0) - (a.statistics?.episodeCount || 0);
        default: return a.sortTitle.localeCompare(b.sortTitle);
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TV Shows</h1>
        <div className="flex gap-2">
          {missingCount > 0 && (
            <button
              onClick={() => searchMissingMutation.mutate()}
              disabled={searchMissingMutation.isPending}
              className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {searchMissingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search Missing ({missingCount})
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Series
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar placeholder="Search TV shows..." onSearch={handleSearch} />
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="monitored">Monitored</option>
            <option value="continuing">Continuing</option>
            <option value="ended">Ended</option>
            <option value="missing">Missing Episodes</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="title">Title</option>
            <option value="year">Year</option>
            <option value="added">Date Added</option>
            <option value="episodes">Episode Count</option>
          </select>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error instanceof ApiError && error.reason === 'no_api_key'
            ? 'Sonarr API key not configured. Add it in Settings → Services to connect to Sonarr.'
            : 'Sonarr is unavailable. Check that the Sonarr container is running.'}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{filtered.length} series</p>

      <MediaGrid isLoading={isLoading}>
        {filtered.map((s) => {
          const poster = s.images?.find(i => i.coverType === 'poster');
          const completion = s.statistics?.percentOfEpisodes ?? 0;
          return (
            <MediaCard
              key={s.id}
              title={s.title}
              year={s.year}
              posterUrl={poster?.remoteUrl || poster?.url}
              monitored={s.monitored}
              hasFile={completion >= 100}
              subtitle={`${s.statistics?.seasonCount || 0} seasons · ${Math.round(completion)}%`}
              episodeProgress={{
                have: s.statistics?.episodeFileCount || 0,
                total: s.statistics?.episodeCount || 0,
              }}
              onClick={() => setSelectedSeries(s)}
            />
          );
        })}
      </MediaGrid>

      {selectedSeries && (() => {
        const current = series?.find(s => s.id === selectedSeries.id) || selectedSeries;
        return (
          <MediaDetail
            open={!!selectedSeries}
            onClose={() => setSelectedSeries(null)}
            title={current.title}
            year={current.year}
            overview={current.overview}
            posterUrl={current.images?.find(i => i.coverType === 'poster')?.remoteUrl}
            monitored={current.monitored}
            hasFile={(current.statistics?.percentOfEpisodes ?? 0) >= 100}
            sizeOnDisk={current.statistics?.sizeOnDisk}
            path={current.path}
            added={current.added}
            genres={current.genres}
            runtime={current.runtime}
            certification={current.certification}
            seriesStatus={current.status}
            network={current.network}
            nextAiring={current.nextAiring}
            episodeStats={{
              fileCount: current.statistics?.episodeFileCount || 0,
              totalCount: current.statistics?.episodeCount || 0,
              percent: current.statistics?.percentOfEpisodes || 0,
            }}
            seasons={current.seasons}
            onDelete={(deleteFiles) => deleteMutation.mutate({ id: current.id, deleteFiles })}
            isDeleting={deleteMutation.isPending}
          >
            <SeriesEpisodes seriesId={current.id} />
          </MediaDetail>
        );
      })()}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Series">
        <div className="space-y-4">
          <SearchBar
            placeholder="Search TVDB..."
            onSearch={(q) => setLookupTerm(q)}
          />
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {lookupResults?.map((result) => (
              <div
                key={result.tvdbId}
                className="flex cursor-pointer items-center gap-3 rounded-md bg-muted/50 p-3 hover:bg-muted transition-colors"
                onClick={() => addMutation.mutate({
                  title: result.title,
                  tvdbId: result.tvdbId,
                  titleSlug: result.titleSlug,
                  qualityProfileId: 1,
                  monitored: true,
                  seasonFolder: true,
                  rootFolderPath: '/data/media/tv',
                  addOptions: { searchForMissingEpisodes: true },
                } as unknown as Partial<SonarrSeries>)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{result.title}</p>
                  <p className="text-xs text-muted-foreground">{result.year} · {result.network}</p>
                </div>
                <Badge variant="outline">TVDB</Badge>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
