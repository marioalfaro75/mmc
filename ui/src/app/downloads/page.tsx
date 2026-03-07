'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldAlert, Download } from 'lucide-react';
import { DownloadQueue } from '@/components/downloads/DownloadQueue';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { cn } from '@/lib/utils';
import type { DownloadItem } from '@/lib/types/common';
import type { VpnStatus } from '@/lib/types/common';
import { toast } from 'sonner';

type TabKey = 'active' | 'completed' | 'failed';

export default function DownloadsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('active');

  const { data: downloads = [], isLoading } = useQuery<DownloadItem[]>({
    queryKey: ['downloads'],
    queryFn: () => fetch('/api/downloads').then(r => r.json()),
    refetchInterval: POLLING.DOWNLOADS,
    staleTime: STALE_TIME.DOWNLOADS,
  });

  const { data: vpn } = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetch('/api/vpn').then(r => r.json()),
    refetchInterval: POLLING.VPN,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/downloads/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      toast.success('Download removed');
    },
    onError: () => toast.error('Failed to remove download'),
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'active', label: 'Active', count: downloads.filter(d => ['downloading', 'paused', 'queued', 'extracting'].includes(d.status)).length },
    { key: 'completed', label: 'Completed', count: downloads.filter(d => ['completed', 'seeding'].includes(d.status)).length },
    { key: 'failed', label: 'Failed', count: downloads.filter(d => d.status === 'failed').length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Download className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Downloads</h1>
      </div>

      {/* VPN Banner */}
      {vpn && !vpn.connected && (
        <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-4 py-3 text-danger">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            VPN Disconnected — downloads are paused for your protection.
          </p>
        </div>
      )}
      {vpn?.connected && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-success">
          <Shield className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            VPN Connected — {vpn.ip} ({vpn.country})
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <DownloadQueue
        items={downloads}
        isLoading={isLoading}
        activeTab={activeTab}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
    </div>
  );
}
