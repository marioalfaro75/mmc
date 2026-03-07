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
import type { RadarrMovie, RadarrLookupResult } from '@/lib/types/radarr';
import { toast } from 'sonner';

type FilterKey = 'all' | 'monitored' | 'unmonitored' | 'missing';
type SortKey = 'title' | 'year' | 'added' | 'size';

export default function MoviesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('title');
  const [selectedMovie, setSelectedMovie] = useState<RadarrMovie | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [lookupTerm, setLookupTerm] = useState('');

  const { data: movies, isLoading } = useQuery<RadarrMovie[]>({
    queryKey: ['movies'],
    queryFn: () => fetch('/api/movies').then(r => r.json()),
    staleTime: STALE_TIME.LIBRARY,
  });

  const { data: lookupResults } = useQuery<RadarrLookupResult[]>({
    queryKey: ['movies', 'lookup', lookupTerm],
    queryFn: () => fetch(`/api/movies/lookup?term=${encodeURIComponent(lookupTerm)}`).then(r => r.json()),
    enabled: lookupTerm.length > 2,
  });

  const addMutation = useMutation({
    mutationFn: (movie: Partial<RadarrMovie>) =>
      fetch('/api/movies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(movie) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      setShowAdd(false);
      toast.success('Movie added to Radarr');
    },
    onError: () => toast.error('Failed to add movie'),
  });

  const handleSearch = useCallback((q: string) => setSearch(q), []);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movies</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Movie
        </button>
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

      {selectedMovie && (
        <MediaDetail
          open={!!selectedMovie}
          onClose={() => setSelectedMovie(null)}
          title={selectedMovie.title}
          year={selectedMovie.year}
          overview={selectedMovie.overview}
          posterUrl={selectedMovie.images?.find(i => i.coverType === 'poster')?.remoteUrl}
          monitored={selectedMovie.monitored}
          hasFile={selectedMovie.hasFile}
          sizeOnDisk={selectedMovie.sizeOnDisk}
          path={selectedMovie.path}
          added={selectedMovie.added}
          genres={selectedMovie.genres}
          runtime={selectedMovie.runtime}
          certification={selectedMovie.certification}
        />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Movie">
        <div className="space-y-4">
          <SearchBar
            placeholder="Search TMDB..."
            onSearch={(q) => setLookupTerm(q)}
          />
          <div className="max-h-80 space-y-2 overflow-y-auto">
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{result.title}</p>
                  <p className="text-xs text-muted-foreground">{result.year}</p>
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
