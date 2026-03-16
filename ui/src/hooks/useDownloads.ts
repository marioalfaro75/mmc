'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { DownloadItem } from '@/lib/types/common';

interface DownloadsResponse {
  items: DownloadItem[];
  clients: { torrent: boolean; usenet: boolean };
}

export function useDownloads() {
  const queryClient = useQueryClient();

  const query = useQuery<DownloadsResponse>({
    queryKey: ['downloads'],
    queryFn: () => fetchApi<DownloadsResponse>('/api/downloads'),
    refetchInterval: POLLING.DOWNLOADS,
    staleTime: STALE_TIME.DOWNLOADS,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/downloads/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const items = query.data?.items ?? [];

  const active = items.filter(d =>
    ['downloading', 'paused', 'queued', 'extracting'].includes(d.status)
  );

  const completed = items.filter(d =>
    ['completed', 'seeding'].includes(d.status)
  );

  const failed = items.filter(d => d.status === 'failed');

  return {
    downloads: items,
    active,
    completed,
    failed,
    clients: query.data?.clients,
    isLoading: query.isLoading,
    isError: query.isError,
    deleteDownload: deleteMutation.mutate,
  };
}
