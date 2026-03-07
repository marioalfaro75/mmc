'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaGrid } from '@/components/media/MediaGrid';
import { MediaDetail } from '@/components/media/MediaDetail';
import { SearchBar } from '@/components/media/SearchBar';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { STALE_TIME } from '@/lib/utils/polling';
import type { SonarrSeries, SonarrLookupResult } from '@/lib/types/sonarr';
import { toast } from 'sonner';

type FilterKey = 'all' | 'monitored' | 'continuing' | 'ended' | 'missing';
type SortKey = 'title' | 'year' | 'added' | 'episodes';

export default function TvPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('title');
  const [selectedSeries, setSelectedSeries] = useState<SonarrSeries | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [lookupTerm, setLookupTerm] = useState('');

  const { data: series, isLoading } = useQuery<SonarrSeries[]>({
    queryKey: ['series'],
    queryFn: () => fetch('/api/series').then(r => r.json()),
    staleTime: STALE_TIME.LIBRARY,
  });

  const { data: lookupResults } = useQuery<SonarrLookupResult[]>({
    queryKey: ['series', 'lookup', lookupTerm],
    queryFn: () => fetch(`/api/series/lookup?term=${encodeURIComponent(lookupTerm)}`).then(r => r.json()),
    enabled: lookupTerm.length > 2,
  });

  const addMutation = useMutation({
    mutationFn: (s: Partial<SonarrSeries>) =>
      fetch('/api/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series'] });
      setShowAdd(false);
      toast.success('Series added to Sonarr');
    },
    onError: () => toast.error('Failed to add series'),
  });

  const handleSearch = useCallback((q: string) => setSearch(q), []);

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
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Series
        </button>
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
              onClick={() => setSelectedSeries(s)}
            />
          );
        })}
      </MediaGrid>

      {selectedSeries && (
        <MediaDetail
          open={!!selectedSeries}
          onClose={() => setSelectedSeries(null)}
          title={selectedSeries.title}
          year={selectedSeries.year}
          overview={selectedSeries.overview}
          posterUrl={selectedSeries.images?.find(i => i.coverType === 'poster')?.remoteUrl}
          monitored={selectedSeries.monitored}
          hasFile={(selectedSeries.statistics?.percentOfEpisodes ?? 0) >= 100}
          sizeOnDisk={selectedSeries.statistics?.sizeOnDisk}
          path={selectedSeries.path}
          added={selectedSeries.added}
          genres={selectedSeries.genres}
          runtime={selectedSeries.runtime}
          certification={selectedSeries.certification}
        />
      )}

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
