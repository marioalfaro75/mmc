'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import { formatDate } from '@/lib/utils/formatters';

interface RequestData {
  results: Array<{
    id: number;
    status: number;
    type: string;
    media: {
      title?: string;
      name?: string;
      posterPath?: string;
    };
    requestedBy: { displayName: string };
    createdAt: string;
  }>;
}

export function PendingRequests() {
  const { data, isLoading, isError } = useQuery<RequestData>({
    queryKey: ['requests'],
    queryFn: () => fetchApi<RequestData>('/api/requests'),
    refetchInterval: POLLING.REQUESTS,
  });

  const pending = data?.results?.filter(r => r.status === 1) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Pending Requests
          </div>
        </CardTitle>
        <Badge variant={pending.length > 0 ? 'warning' : 'outline'}>
          {pending.length}
        </Badge>
      </CardHeader>
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Seerr unavailable</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending requests</p>
        ) : (
          pending.slice(0, 5).map((req) => (
            <div key={req.id} className="flex items-center justify-between rounded-md bg-muted/50 p-2">
              <div>
                <p className="text-sm">{req.media.title || req.media.name}</p>
                <p className="text-xs text-muted-foreground">
                  by {req.requestedBy.displayName} &middot; {formatDate(req.createdAt)}
                </p>
              </div>
              <Badge variant="warning">{req.type}</Badge>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
