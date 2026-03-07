'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME } from '@/lib/utils/polling';
import type { RadarrMovie } from '@/lib/types/radarr';
import type { SonarrSeries } from '@/lib/types/sonarr';

export function useMovies() {
  const queryClient = useQueryClient();

  const query = useQuery<RadarrMovie[]>({
    queryKey: ['movies'],
    queryFn: () => fetch('/api/movies').then(r => r.json()),
    staleTime: STALE_TIME.LIBRARY,
  });

  const addMutation = useMutation({
    mutationFn: (movie: Partial<RadarrMovie>) =>
      fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(movie),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['movies'] }),
  });

  return {
    movies: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    addMovie: addMutation.mutate,
    isAdding: addMutation.isPending,
  };
}

export function useSeries() {
  const queryClient = useQueryClient();

  const query = useQuery<SonarrSeries[]>({
    queryKey: ['series'],
    queryFn: () => fetch('/api/series').then(r => r.json()),
    staleTime: STALE_TIME.LIBRARY,
  });

  const addMutation = useMutation({
    mutationFn: (series: Partial<SonarrSeries>) =>
      fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(series),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['series'] }),
  });

  return {
    series: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    addSeries: addMutation.mutate,
    isAdding: addMutation.isPending,
  };
}
