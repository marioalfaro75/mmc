'use client';

import { useQuery } from '@tanstack/react-query';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import type { ServiceHealth, VpnStatus } from '@/lib/types/common';

export function useSystemHealth() {
  const healthQuery = useQuery<{ services: ServiceHealth[] }>({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then(r => r.json()),
    refetchInterval: POLLING.HEALTH,
    staleTime: STALE_TIME.HEALTH,
  });

  const vpnQuery = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetch('/api/vpn').then(r => r.json()),
    refetchInterval: POLLING.VPN,
  });

  const services = healthQuery.data?.services ?? [];
  const onlineCount = services.filter(s => s.status === 'online').length;
  const offlineCount = services.filter(s => s.status === 'offline').length;

  return {
    services,
    vpn: vpnQuery.data ?? { connected: false, ip: null, country: null },
    isLoading: healthQuery.isLoading,
    isError: healthQuery.isError,
    onlineCount,
    offlineCount,
    totalCount: services.length,
  };
}
