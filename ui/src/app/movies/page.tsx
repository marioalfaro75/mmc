'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Loader2, Info } from 'lucide-react';
import { MediaCard } from '@/components/media/MediaCard';
import { MediaGrid } from '@/components/media/MediaGrid';
import { MediaDetail } from '@/components/media/MediaDetail';
import { SearchBar } from '@/components/media/SearchBar';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi, ApiError } from '@/lib/utils/fetchApi';
import type { RadarrMovie, RadarrLookupResult } from '@/lib/types/radarr';
import { toast } from 'sonner';

type FilterKey = 'all' | 'monitored' | 'unmonitored' | 'missing';
type SortKey = 'title' | 'year' | 'added' | 'size';
type SearchMode = 'title' | 'actor' | 'year';

async function pollForDownload(movieId: number, title: string) {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const data = await fetchApi<{ records: { movieId: number }[] }>(`/api/movies/queue?movieId=${movieId}`);
      if (data.records?.length > 0) {
        toast.success(`Download found for "${title}"`);
        return;
      }
    } catch { /* keep polling */ }
  }
  toast.warning(`No download found yet for "${title}" — it will be retried automatically every 6 hours`);
}

export default function MoviesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('title');
  const [selectedMovie, setSelectedMovie] = useState<RadarrMovie | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [lookupTerm, setLookupTerm] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('title');
  const addedTitle = useRef('');

  const { data: movies, isLoading, isError, error } = useQuery<RadarrMovie[]>({
    queryKey: ['movies'],
    queryFn: () => fetchApi<RadarrMovie[]>('/api/movies'),
    staleTime: STALE_TIME.LIBRARY,
    refetchInterval: POLLING.LIBRARY,
  });

  const { data: tmdbStatus } = useQuery<{ configured: boolean }>({
    queryKey: ['tmdb-status'],
    queryFn: () => fetchApi<{ configured: boolean }>('/api/tmdb/status'),
    staleTime: 5 * 60_000,
  });

  const lookupUrl = searchMode === 'actor'
    ? `/api/movies/lookup-actor?actor=${encodeURIComponent(lookupTerm)}`
    : `/api/movies/lookup?term=${encodeURIComponent(lookupTerm)}`;

  const { data: lookupResults, isFetching: lookupFetching } = useQuery<RadarrLookupResult[]>({
    queryKey: ['movies', 'lookup', searchMode, lookupTerm],
    queryFn: () => fetchApi<RadarrLookupResult[]>(lookupUrl),
    enabled: lookupTerm.length > 2 && (searchMode !== 'actor' || !!tmdbStatus?.configured),
  });

  const addMutation = useMutation({
    mutationFn: (movie: Partial<RadarrMovie>) => {
      addedTitle.current = movie.title || '';
      return fetchApi<RadarrMovie>('/api/movies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(movie) });
    },
    onSuccess: (data: RadarrMovie) => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      setShowAdd(false);
      toast.info(`"${addedTitle.current}" added — searching for downloads...`);
      pollForDownload(data.id, addedTitle.current);
    },
    onError: () => toast.error('Failed to add movie'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, deleteFiles }: { id: number; deleteFiles: boolean }) =>
      fetchApi(`/api/movies?id=${id}&deleteFiles=${deleteFiles}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      setSelectedMovie(null);
      toast.success('Movie removed');
    },
    onError: () => toast.error('Failed to remove movie'),
  });

  const searchMissingMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/movies/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'MissingMoviesSearch' }),
      }),
    onSuccess: () => toast.success('Searching for all missing movies...'),
    onError: () => toast.error('Failed to start missing movies search'),
  });

  const handleSearch = useCallback((q: string) => setSearch(q), []);

  const missingCount = (movies || []).filter(m => m.monitored && !m.hasFile).length;

  const filtered = (movies || [])
    .filter((m) => {
      if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === 'monitored' && !m.monitored) return false;
      if (filter === 'unmonitored' && m.monitored) return false;
      if (filter === 'missing' && m.hasFile) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case 'year': return (b.year || 0) - (a.year || 0);
        case 'added': return new Date(b.added).getTime() - new Date(a.added).getTime();
        case 'size': return (b.sizeOnDisk || 0) - (a.sizeOnDisk || 0);
        default: return a.sortTitle.localeCompare(b.sortTitle);
      }
    });

  const searchPlaceholder = searchMode === 'actor'
    ? 'Search by actor name...'
    : searchMode === 'year'
      ? 'Enter year (e.g. 2024)...'
      : 'Search TMDB...';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movies</h1>
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
            Add Movie
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar placeholder="Search movies..." onSearch={handleSearch} />
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="monitored">Monitored</option>
            <option value="unmonitored">Unmonitored</option>
            <option value="missing">Missing</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="title">Title</option>
            <option value="year">Year</option>
            <option value="added">Date Added</option>
            <option value="size">File Size</option>
          </select>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error instanceof ApiError && error.reason === 'no_api_key'
            ? 'Radarr API key not configured. Add it in Settings → Services to connect to Radarr.'
            : 'Radarr is unavailable. Check that the Radarr container is running.'}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{filtered.length} movies</p>

      <MediaGrid isLoading={isLoading}>
        {filtered.map((movie) => {
          const poster = movie.images?.find(i => i.coverType === 'poster');
          return (
            <MediaCard
              key={movie.id}
              title={movie.title}
              year={movie.year}
              posterUrl={poster?.remoteUrl || poster?.url}
              monitored={movie.monitored}
              hasFile={movie.hasFile}
              onClick={() => setSelectedMovie(movie)}
            />
          );
        })}
      </MediaGrid>

      {selectedMovie && (() => {
        const current = movies?.find(m => m.id === selectedMovie.id) || selectedMovie;
        return (
          <MediaDetail
            open={!!selectedMovie}
            onClose={() => setSelectedMovie(null)}
            title={current.title}
            year={current.year}
            overview={current.overview}
            posterUrl={current.images?.find(i => i.coverType === 'poster')?.remoteUrl}
            monitored={current.monitored}
            hasFile={current.hasFile}
            sizeOnDisk={current.sizeOnDisk}
            path={current.path}
            added={current.added}
            genres={current.genres}
            runtime={current.runtime}
            certification={current.certification}
            onDelete={(deleteFiles) => deleteMutation.mutate({ id: current.id, deleteFiles })}
            isDeleting={deleteMutation.isPending}
          />
        );
      })()}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setSearchMode('title'); setLookupTerm(''); }} title="Add Movie">
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchBar
                placeholder={searchPlaceholder}
                onSearch={(q) => setLookupTerm(q)}
              />
            </div>
            <select
              value={searchMode}
              onChange={(e) => { setSearchMode(e.target.value as SearchMode); setLookupTerm(''); }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="title">Title</option>
              <option value="year">Year</option>
              {tmdbStatus?.configured && <option value="actor">Actor</option>}
            </select>
          </div>

          {!tmdbStatus?.configured && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Add a free <strong className="text-foreground">TMDB API key</strong> in{' '}
                <a href="/settings" className="text-primary underline">Settings → Services</a>{' '}
                or via the{' '}
                <a href="/guide" className="text-primary underline">Setup Guide</a>{' '}
                to enable searching by actor name.
              </p>
            </div>
          )}

          <div className="max-h-80 space-y-2 overflow-y-auto pr-2">
            {lookupFetching && lookupTerm.length > 2 && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {lookupResults?.map((result) => (
              <div
                key={result.tmdbId}
                className="flex cursor-pointer items-center gap-3 rounded-md bg-muted/50 p-3 hover:bg-muted transition-colors"
                onClick={() => addMutation.mutate({
                  title: result.title,
                  tmdbId: result.tmdbId,
                  titleSlug: result.titleSlug,
                  qualityProfileId: 1,
                  monitored: true,
                  minimumAvailability: 'released',
                  rootFolderPath: '/data/media/movies',
                  addOptions: { searchForMovie: true },
                } as unknown as Partial<RadarrMovie>)}
              >
                {result.remotePoster && (
                  <img
                    src={result.remotePoster}
                    alt={result.title}
                    className="h-16 w-11 rounded object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{result.title}</p>
                  <p className="text-xs text-muted-foreground">{result.year || 'TBA'}</p>
                  {searchMode === 'actor' && result.overview && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{result.overview}</p>
                  )}
                </div>
                <Badge variant="outline">TMDB</Badge>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
