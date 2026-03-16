'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldAlert, Download } from 'lucide-react';
import { DownloadQueue } from '@/components/downloads/DownloadQueue';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { cn } from '@/lib/utils';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { DownloadItem } from '@/lib/types/common';
import type { VpnStatus } from '@/lib/types/common';
import { toast } from 'sonner';

type TabKey = 'active' | 'completed' | 'failed';

interface DownloadsResponse {
  items: DownloadItem[];
  clients: { torrent: boolean; usenet: boolean };
}

export default function DownloadsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('active');

  const { data: downloadsData, isLoading } = useQuery<DownloadsResponse>({
    queryKey: ['downloads'],
    queryFn: () => fetchApi<DownloadsResponse>('/api/downloads'),
    refetchInterval: POLLING.DOWNLOADS,
    staleTime: STALE_TIME.DOWNLOADS,
  });

  const downloads = downloadsData?.items ?? [];
  const clients = downloadsData?.clients;

  const { data: vpn } = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetchApi<VpnStatus>('/api/vpn'),
    refetchInterval: POLLING.VPN,
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      fetchApi(`/api/downloads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      const labels: Record<string, string> = { pause: 'paused', resume: 'resumed', forceStart: 'force started' };
      toast.success(`Download ${labels[action] || action}`);
    },
    onError: (_err, { action }) => toast.error(`Failed to ${action} download`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/downloads/${id}`, { method: 'DELETE' }),
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

      {clients && !clients.torrent && !clients.usenet && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <Download className="h-4 w-4 shrink-0" />
          Both download clients are unreachable. qBittorrent and SABnzbd may be offline.
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
        onPause={(id) => actionMutation.mutate({ id, action: 'pause' })}
        onResume={(id) => actionMutation.mutate({ id, action: 'resume' })}
        onForceStart={(id) => actionMutation.mutate({ id, action: 'forceStart' })}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
    </div>
  );
}
