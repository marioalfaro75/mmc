'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Shield, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { ServiceHealth, VpnStatus } from '@/lib/types/common';

export function SystemHealth() {
  const { data: healthData, isLoading: healthLoading } = useQuery<{ services: ServiceHealth[] }>({
    queryKey: ['health'],
    queryFn: () => fetchApi<{ services: ServiceHealth[] }>('/api/health'),
    refetchInterval: POLLING.HEALTH,
    staleTime: STALE_TIME.HEALTH,
  });

  const { data: vpnData } = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetchApi<VpnStatus>('/api/vpn'),
    refetchInterval: POLLING.VPN,
    staleTime: STALE_TIME.VPN,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
          </div>
        </CardTitle>
      </CardHeader>

      {/* VPN Status Banner */}
      {vpnData && (
        <div
          className={`mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            vpnData.status === 'connected' ? 'bg-success/10 text-success'
              : vpnData.status === 'connecting' ? 'bg-warning/10 text-warning'
              : vpnData.status === 'error' ? 'bg-danger/10 text-danger'
              : 'bg-danger/10 text-danger'
          }`}
        >
          {vpnData.status === 'connected' ? (
            <ShieldCheck className="h-4 w-4" />
          ) : vpnData.status === 'connecting' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          <span>
            {vpnData.status === 'connected'
              ? `VPN: Connected (${vpnData.ip}${vpnData.country ? `, ${vpnData.country}` : ''})`
              : `VPN: ${vpnData.statusMessage}`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {healthLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-muted p-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))
        ) : (
          healthData?.services?.map((service) => (
            <div
              key={service.name}
              className="flex items-center gap-2 rounded-md bg-muted/50 p-2"
            >
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  service.status === 'online' ? 'bg-success' : 'bg-danger'
                }`}
              />
              <span className="text-xs">{service.name}</span>
              {service.version && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {service.version}
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
