'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Check, X, Loader2, Search, Film, Tv, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { SearchBar } from '@/components/media/SearchBar';
import { POLLING } from '@/lib/utils/polling';
import { fetchApi, ApiError } from '@/lib/utils/fetchApi';
import { formatDateTime } from '@/lib/utils/formatters';
import { toast } from 'sonner';
import type { SeerrSearchResult } from '@/lib/api/seerr';

const statusMap: Record<number, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
  1: { label: 'Pending', variant: 'warning' },
  2: { label: 'Approved', variant: 'success' },
  3: { label: 'Declined', variant: 'danger' },
  4: { label: 'Available', variant: 'success' },
};

interface RequestData {
  results: Array<{
    id: number;
    status: number;
    type: string;
    media: {
      title?: string;
      name?: string;
      posterPath?: string;
      mediaType: string;
    };
    requestedBy: { displayName: string; avatar: string };
    createdAt: string;
  }>;
  pageInfo: { pages: number; results: number };
}

function getMediaStatus(item: SeerrSearchResult): 'available' | 'requested' | 'none' {
  if (!item.mediaInfo) return 'none';
  if (item.mediaInfo.status >= 4) return 'available'; // 4 = partially available, 5 = available
  if (item.mediaInfo.status >= 2) return 'requested'; // 2 = pending, 3 = processing
  return 'none';
}

export default function RequestsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError, error } = useQuery<RequestData>({
    queryKey: ['requests'],
    queryFn: () => fetchApi<RequestData>('/api/requests'),
    refetchInterval: POLLING.REQUESTS,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery<{ results: SeerrSearchResult[] }>({
    queryKey: ['requests', 'search', searchTerm],
    queryFn: () => fetchApi(`/api/requests/search?query=${encodeURIComponent(searchTerm)}`),
    enabled: searchTerm.length >= 2,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', id }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('Request approved');
    },
  });

  const declineMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decline', id }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('Request declined');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('Request deleted');
    },
    onError: () => toast.error('Failed to delete request'),
  });

  const requestMutation = useMutation({
    mutationFn: (item: SeerrSearchResult) =>
      fetchApi('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType: item.mediaType, mediaId: item.id }),
      }),
    onSuccess: (_data, item) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success(`Requested "${item.title || item.name}"`);
      setSearchTerm('');
    },
    onError: (_err, item) => toast.error(`Failed to request "${item.title || item.name}"`),
  });

  const { data: seerrStatus } = useQuery<{ radarr: number; sonarr: number }>({
    queryKey: ['seerr', 'status'],
    queryFn: () => fetchApi('/api/seerr/configure'),
    enabled: !isError,
  });

  const seerrConfigured = (seerrStatus?.radarr ?? 0) > 0 && (seerrStatus?.sonarr ?? 0) > 0;

  const configureMutation = useMutation({
    mutationFn: () => fetchApi('/api/seerr/configure', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['seerr', 'status'] });
      toast.success('Seerr configured with Sonarr and Radarr');
    },
    onError: () => toast.error('Failed to auto-configure Seerr'),
  });

  const handleSearch = useCallback((q: string) => setSearchTerm(q), []);

  const searchResults = searchData?.results?.slice(0, 12) ?? [];
  const pendingCount = data?.results?.filter(r => r.status === 1).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Requests</h1>
        </div>
        <button
          onClick={() => !seerrConfigured && configureMutation.mutate()}
          disabled={configureMutation.isPending || seerrConfigured}
          className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {configureMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${seerrConfigured ? 'bg-green-500' : 'bg-orange-500'}`} />
          )}
          {seerrConfigured ? 'Configured' : 'Auto-configure Seerr'}
        </button>
      </div>

      {isError && (
        <Card className="p-6 text-center space-y-3">
          <p className="text-muted-foreground">
            {error instanceof ApiError && error.reason === 'no_api_key'
              ? 'Seerr API key not configured. Add it in Settings → Services to enable media requests.'
              : error instanceof ApiError && error.reason === 'setup_required'
              ? 'Seerr setup not complete. Open Seerr at localhost:5055 and sign in with your Plex account to finish setup.'
              : 'Seerr is unavailable. Check that the Seerr container is running.'}
          </p>
          {error instanceof ApiError && error.reason === 'setup_required' && (
            <p className="text-xs text-muted-foreground">
              After signing in, return here and click the button below to connect Sonarr and Radarr automatically.
            </p>
          )}
        </Card>
      )}

      {/* Search */}
      {!isError && (
        <>
          <SearchBar placeholder="Search movies and TV shows to request..." onSearch={handleSearch} />

          {searchTerm.length >= 2 && (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                {searchLoading ? 'Searching...' : `${searchResults.length} results for "${searchTerm}"`}
              </p>
              {searchLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {searchResults.map((item) => {
                    const title = item.title || item.name || 'Unknown';
                    const year = (item.releaseDate || item.firstAirDate || '').substring(0, 4);
                    const posterUrl = item.posterPath
                      ? `https://image.tmdb.org/t/p/w185${item.posterPath}`
                      : null;
                    const mediaStatus = getMediaStatus(item);

                    return (
                      <div
                        key={`${item.mediaType}-${item.id}`}
                        className="group overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-primary/50"
                      >
                        <div className="relative aspect-[2/3] bg-muted">
                          {posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={posterUrl}
                              alt={title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              No Poster
                            </div>
                          )}
                          <div className="absolute right-1 top-1">
                            <Badge variant="outline" className="bg-black/60 text-[10px]">
                              {item.mediaType === 'movie' ? <Film className="mr-0.5 h-2.5 w-2.5" /> : <Tv className="mr-0.5 h-2.5 w-2.5" />}
                              {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                            </Badge>
                          </div>
                          {mediaStatus === 'available' && (
                            <div className="absolute bottom-1 left-1">
                              <Badge variant="success" className="text-[10px]">Available</Badge>
                            </div>
                          )}
                          {mediaStatus === 'requested' && (
                            <div className="absolute bottom-1 left-1">
                              <Badge variant="warning" className="text-[10px]">Requested</Badge>
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs font-medium">{title}</p>
                          <p className="text-[10px] text-muted-foreground">{year}</p>
                          {mediaStatus === 'none' && (
                            <button
                              onClick={() => requestMutation.mutate(item)}
                              disabled={requestMutation.isPending}
                              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                              <Plus className="h-3 w-3" />
                              Request
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Existing Requests */}
      {!isError && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Requests {pendingCount > 0 && <Badge variant="warning" className="ml-1">{pendingCount} pending</Badge>}
          </h2>
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
            ) : !data?.results?.length ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No requests yet. Search above to request movies and TV shows.</p>
            ) : (
              data.results.map((req) => {
                const status = statusMap[req.status] || { label: 'Unknown', variant: 'default' as const };
                return (
                  <Card key={req.id} className="flex items-center gap-4 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                      {req.type === 'movie' ? 'MOV' : 'TV'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{req.media.title || req.media.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {req.requestedBy?.displayName && <>Requested by {req.requestedBy.displayName} &middot; </>}{formatDateTime(req.createdAt)}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <div className="flex gap-1">
                      {req.status === 1 && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate(req.id)}
                            className="rounded p-1.5 text-success hover:bg-success/20 transition-colors"
                            title="Approve"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => declineMutation.mutate(req.id)}
                            className="rounded p-1.5 text-danger hover:bg-danger/20 transition-colors"
                            title="Decline"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => deleteMutation.mutate(req.id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-danger/20 hover:text-danger transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
