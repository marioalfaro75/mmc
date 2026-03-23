'use client';

import { useQuery } from '@tanstack/react-query';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { ServiceHealth, VpnStatus } from '@/lib/types/common';

export function useSystemHealth() {
  const healthQuery = useQuery<{ services: ServiceHealth[] }>({
    queryKey: ['health'],
    queryFn: () => fetchApi<{ services: ServiceHealth[] }>('/api/health'),
    refetchInterval: POLLING.HEALTH,
    staleTime: STALE_TIME.HEALTH,
  });

  const vpnQuery = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetchApi<VpnStatus>('/api/vpn'),
    refetchInterval: POLLING.VPN,
    staleTime: STALE_TIME.VPN,
  });

  const services = healthQuery.data?.services ?? [];
  const onlineCount = services.filter(s => s.status === 'online').length;
  const offlineCount = services.filter(s => s.status === 'offline').length;

  return {
    services,
    vpn: vpnQuery.data ?? { connected: false, status: 'disconnected' as const, statusMessage: '', ip: null, country: null },
    isLoading: healthQuery.isLoading,
    isError: healthQuery.isError,
    onlineCount,
    offlineCount,
    totalCount: services.length,
  };
}
