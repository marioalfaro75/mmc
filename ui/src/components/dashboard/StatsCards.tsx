'use client';

import { useQuery } from '@tanstack/react-query';
import { Film, Tv, HardDrive, PlayCircle } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Skeleton } from '@/components/common/Skeleton';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { DashboardStats } from '@/lib/types/common';

export function StatsCards() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetchApi<DashboardStats>('/api/dashboard/stats'),
    refetchInterval: POLLING.STATS,
    staleTime: STALE_TIME.STATS,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="mb-2 h-4 w-16" />
            <Skeleton className="h-8 w-12" />
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    { label: 'Movies', value: data?.movies ?? 0, icon: Film },
    { label: 'TV Series', value: data?.series ?? 0, icon: Tv },
    { label: 'Episodes', value: data?.episodes ?? 0, icon: PlayCircle },
    { label: 'Disk Used', value: data?.diskUsed ?? 'N/A', icon: HardDrive },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-bold">{stat.value}</p>
        </Card>
      ))}
    </div>
  );
}
