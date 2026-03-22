'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Tv, Film } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { fetchApi } from '@/lib/utils/fetchApi';
import { toast } from 'sonner';

interface ProfileInfo {
  id: number;
  name: string;
  upgradeAllowed: boolean;
  service: 'sonarr' | 'radarr';
  usedBy: number;
}

export function QualityTab() {
  const queryClient = useQueryClient();
  const [bulkService, setBulkService] = useState<'sonarr' | 'radarr'>('sonarr');
  const [bulkProfileId, setBulkProfileId] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const { data, isLoading } = useQuery<{ profiles: ProfileInfo[] }>({
    queryKey: ['quality-profiles'],
    queryFn: () => fetchApi<{ profiles: ProfileInfo[] }>('/api/quality-profiles'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, service, upgradeAllowed }: { id: number; service: string; upgradeAllowed: boolean }) =>
      fetchApi(`/api/quality-profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, upgradeAllowed }),
      }),
    onSuccess: (_data, { upgradeAllowed }) => {
      queryClient.invalidateQueries({ queryKey: ['quality-profiles'] });
      toast.success(`Upgrades ${upgradeAllowed ? 'enabled' : 'disabled'}`);
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ service, qualityProfileId }: { service: string; qualityProfileId: number }) =>
      fetchApi<{ updatedCount: number }>('/api/quality-profiles/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, qualityProfileId }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quality-profiles'] });
      setShowBulkConfirm(false);
      toast.success(`Updated ${data.updatedCount} ${bulkService === 'sonarr' ? 'series' : 'movies'}`);
    },
    onError: () => toast.error('Failed to bulk update'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const profiles = data?.profiles || [];
  const sonarrProfiles = profiles.filter(p => p.service === 'sonarr');
  const radarrProfiles = profiles.filter(p => p.service === 'radarr');

  const currentBulkProfiles = bulkService === 'sonarr' ? sonarrProfiles : radarrProfiles;
  const bulkProfileName = currentBulkProfiles.find(p => p.id === bulkProfileId)?.name;
  const totalItems = currentBulkProfiles.reduce((sum, p) => sum + p.usedBy, 0);

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground space-y-2">
        <p>
          Quality profiles control what resolution and format Sonarr and Radarr download.
          When <strong className="text-foreground">Allow upgrades</strong> is on, a better quality version
          will be downloaded automatically even if you already have a copy — which can lead to duplicate downloads.
        </p>
        <p>
          Turn upgrades off to keep the first version that matches your profile.
          Use <strong className="text-foreground">Bulk Profile Assignment</strong> below to switch all
          movies or TV shows to a specific profile at once.
          See the <a href="/guide" className="text-primary underline">Setup Guide</a> for more detail.
        </p>
      </div>

      {/* Upgrade Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tv className="h-4 w-4" />
            Sonarr — TV Show Profiles
          </CardTitle>
        </CardHeader>
        <div className="p-6 pt-0">
          {sonarrProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sonarr not configured or unreachable</p>
          ) : (
            <div className="space-y-2">
              {sonarrProfiles.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.usedBy > 0 ? (
                      <Badge variant="outline">{p.usedBy} series</Badge>
                    ) : (
                      <Badge variant="outline" className="opacity-50">unused</Badge>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Allow upgrades</span>
                    <button
                      onClick={() => toggleMutation.mutate({ id: p.id, service: 'sonarr', upgradeAllowed: !p.upgradeAllowed })}
                      disabled={toggleMutation.isPending}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        p.upgradeAllowed ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        p.upgradeAllowed ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Film className="h-4 w-4" />
            Radarr — Movie Profiles
          </CardTitle>
        </CardHeader>
        <div className="p-6 pt-0">
          {radarrProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Radarr not configured or unreachable</p>
          ) : (
            <div className="space-y-2">
              {radarrProfiles.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.usedBy > 0 ? (
                      <Badge variant="outline">{p.usedBy} movies</Badge>
                    ) : (
                      <Badge variant="outline" className="opacity-50">unused</Badge>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Allow upgrades</span>
                    <button
                      onClick={() => toggleMutation.mutate({ id: p.id, service: 'radarr', upgradeAllowed: !p.upgradeAllowed })}
                      disabled={toggleMutation.isPending}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        p.upgradeAllowed ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        p.upgradeAllowed ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Bulk Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bulk Profile Assignment</CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            Apply a quality profile to all movies or all TV shows at once.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={bulkService}
                onChange={(e) => { setBulkService(e.target.value as 'sonarr' | 'radarr'); setBulkProfileId(null); setShowBulkConfirm(false); }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="sonarr">TV Shows (Sonarr)</option>
                <option value="radarr">Movies (Radarr)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Profile</label>
              <select
                value={bulkProfileId ?? ''}
                onChange={(e) => { setBulkProfileId(Number(e.target.value)); setShowBulkConfirm(false); }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>Select profile...</option>
                {currentBulkProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={!bulkProfileId}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Apply to All
            </button>
          </div>

          {showBulkConfirm && bulkProfileId && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-4 space-y-3">
              <p className="text-sm">
                This will change <strong>{totalItems} {bulkService === 'sonarr' ? 'series' : 'movies'}</strong> to
                the <strong>&quot;{bulkProfileName}&quot;</strong> profile.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => bulkMutation.mutate({ service: bulkService, qualityProfileId: bulkProfileId })}
                  disabled={bulkMutation.isPending}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {bulkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm
                </button>
                <button
                  onClick={() => setShowBulkConfirm(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
