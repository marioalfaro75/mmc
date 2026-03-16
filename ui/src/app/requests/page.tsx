'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Check, X, Loader2 } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING } from '@/lib/utils/polling';
import { fetchApi, ApiError } from '@/lib/utils/fetchApi';
import { formatDate } from '@/lib/utils/formatters';
import { toast } from 'sonner';

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

export default function RequestsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<RequestData>({
    queryKey: ['requests'],
    queryFn: () => fetchApi<RequestData>('/api/requests'),
    refetchInterval: POLLING.REQUESTS,
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

  const configureMutation = useMutation({
    mutationFn: () => fetchApi('/api/seerr/configure', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('Seerr configured with Sonarr and Radarr');
    },
    onError: () => toast.error('Failed to auto-configure Seerr'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Requests</h1>
        </div>
        <button
          onClick={() => configureMutation.mutate()}
          disabled={configureMutation.isPending}
          className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {configureMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Auto-configure Seerr
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

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : (
          data?.results?.map((req) => {
            const status = statusMap[req.status] || { label: 'Unknown', variant: 'default' as const };
            return (
              <Card key={req.id} className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                  {req.type === 'movie' ? 'MOV' : 'TV'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{req.media.title || req.media.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested by {req.requestedBy.displayName} &middot; {formatDate(req.createdAt)}
                  </p>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
                {req.status === 1 && (
                  <div className="flex gap-1">
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
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
