'use client';

import { useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { ServiceHealth } from '@/lib/types/common';
import { toast } from 'sonner';

interface HealthResponse {
  services: ServiceHealth[];
}

export function ServiceStatusBar() {
  const previousOffline = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const { data } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => fetchApi<HealthResponse>('/api/health'),
    refetchInterval: POLLING.HEALTH,
    staleTime: STALE_TIME.HEALTH,
  });

  useEffect(() => {
    if (!data?.services) return;

    const DOWNLOAD_CLIENTS = ['qBittorrent', 'SABnzbd'];
    const currentOfflineAll = new Set(
      data.services.filter(s => s.status === 'offline').map(s => s.name)
    );
    // Only track download clients as offline if both are down
    const bothDown = DOWNLOAD_CLIENTS.every(n => currentOfflineAll.has(n));
    const currentOffline = new Set(
      Array.from(currentOfflineAll).filter(n => {
        if (DOWNLOAD_CLIENTS.includes(n)) return bothDown;
        return true;
      })
    );

    // Don't show recovery toasts on first load
    if (!isFirstLoad.current) {
      for (const name of Array.from(previousOffline.current)) {
        if (!currentOffline.has(name)) {
          toast.success(`${name} is back online`);
        }
      }
    }

    isFirstLoad.current = false;
    previousOffline.current = currentOffline;
  }, [data]);

  if (!data?.services) return null;

  const DOWNLOAD_CLIENTS = ['qBittorrent', 'SABnzbd'];
  const allOffline = data.services.filter(s => s.status === 'offline');

  // Only report download clients if BOTH are down
  const bothDownloadClientsDown = DOWNLOAD_CLIENTS.every(
    name => allOffline.some(s => s.name === name)
  );
  const offlineNames = allOffline
    .filter(s => {
      if (DOWNLOAD_CLIENTS.includes(s.name)) return bothDownloadClientsDown;
      return true;
    })
    .map(s => s.name);

  if (offlineNames.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium">Offline: </span>
        {offlineNames.join(', ')}
        <span className="text-warning/70"> — some features may be unavailable</span>
      </span>
    </div>
  );
}
