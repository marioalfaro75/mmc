'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { DownloadItem } from '@/lib/types/common';

export function useDownloads() {
  const queryClient = useQueryClient();

  const query = useQuery<DownloadItem[]>({
    queryKey: ['downloads'],
    queryFn: () => fetchApi<DownloadItem[]>('/api/downloads'),
    refetchInterval: POLLING.DOWNLOADS,
    staleTime: STALE_TIME.DOWNLOADS,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/downloads/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const active = query.data?.filter(d =>
    ['downloading', 'paused', 'queued', 'extracting'].includes(d.status)
  ) ?? [];

  const completed = query.data?.filter(d =>
    ['completed', 'seeding'].includes(d.status)
  ) ?? [];

  const failed = query.data?.filter(d => d.status === 'failed') ?? [];

  return {
    downloads: query.data ?? [],
    active,
    completed,
    failed,
    isLoading: query.isLoading,
    isError: query.isError,
    deleteDownload: deleteMutation.mutate,
  };
}
