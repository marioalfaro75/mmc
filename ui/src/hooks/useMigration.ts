'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/lib/utils/fetchApi';

interface MigrationStatus {
  running: boolean;
  phase: 'idle' | 'migrating' | 'complete' | 'error' | 'cancelled';
  steps: { step: string; status: string; message?: string; startedAt?: number; completedAt?: number }[];
  currentStep: number;
  rsyncProgress: {
    percentage: number;
    bytesTransferred: number;
    totalBytes: number;
    filesTransferred: number;
    totalFiles: number;
    speed: string;
    eta: string;
  } | null;
  error: string | null;
  sourcePath: string;
  destinationPath: string;
}

interface VerifyMountResult {
  success: boolean;
  mounted: boolean;
  writable: boolean;
  freeSpace: string | null;
  totalSpace: string | null;
  error?: string;
}

interface PreflightResult {
  success: boolean;
  checks: { check: string; status: 'ok' | 'warn' | 'error'; message: string; detail?: string }[];
}

interface GenerateMountResult {
  success: boolean;
  scriptPath: string;
  command: string;
  mountPoint: string;
  fstabLine: string;
}

interface VerifyNasVolumeResult {
  success: boolean;
  mounted?: boolean;
  writable?: boolean;
  freeSpace?: string;
  totalSpace?: string;
  freeBytes?: number;
  totalBytes?: number;
  error?: string;
  rawError?: string;
}

interface SetupNasVolumeResult {
  success: boolean;
  overridePath?: string;
  mountPath?: string;
  message?: string;
  error?: string;
}

interface NasVolumeStatusResult {
  active: boolean;
  overridePath?: string;
  mountPath?: string;
}

interface NasVolumeRequest {
  protocol: 'smb' | 'nfs';
  host: string;
  sharePath: string;
  smbUser?: string;
  smbPassword?: string;
  vers?: string;
}

interface TestConnectionResult {
  success: boolean;
  reachable?: boolean;
  shareFound?: boolean | null;
  availableShares?: string[];
  shareError?: string | null;
  authFailed?: boolean;
  message?: string;
  error?: string;
}

export function useMigrationStatus(enabled: boolean) {
  return useQuery<MigrationStatus>({
    queryKey: ['migration-status'],
    queryFn: () => fetchApi('/api/migration/status'),
    refetchInterval: (query) => {
      if (!enabled) return false;
      const phase = query.state.data?.phase;
      // Poll fast during active migration, slow down for terminal/idle states
      if (phase === 'migrating') return 2000;
      if (phase === 'idle') return 10000;
      // Terminal states (complete, error, cancelled) — slow poll
      return 5000;
    },
    staleTime: 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useTestConnection() {
  return useMutation<TestConnectionResult, Error, {
    host: string;
    protocol?: string;
    sharePath?: string;
    smbUser?: string;
    smbPassword?: string;
  }>({
    mutationFn: (data) =>
      fetchApi('/api/migration/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}

export function useGenerateMount() {
  return useMutation<GenerateMountResult, Error, {
    protocol: string;
    host: string;
    sharePath: string;
    mountPoint: string;
    smbUser?: string;
    smbPassword?: string;
  }>({
    mutationFn: (data) =>
      fetchApi('/api/migration/generate-mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}

export function useVerifyNasVolume() {
  return useMutation<VerifyNasVolumeResult, Error, NasVolumeRequest>({
    mutationFn: (data) =>
      fetchApi('/api/migration/verify-nas-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}

export function useSetupNasVolume() {
  return useMutation<SetupNasVolumeResult, Error, NasVolumeRequest>({
    mutationFn: (data) =>
      fetchApi('/api/migration/setup-nas-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}

export function useNasVolumeStatus() {
  return useQuery<NasVolumeStatusResult>({
    queryKey: ['nas-volume-status'],
    queryFn: () => fetchApi('/api/migration/setup-nas-volume'),
    staleTime: 30000,
  });
}

export function useVerifyMount() {
  return useMutation<VerifyMountResult, Error, { mountPoint: string }>({
    mutationFn: (data) =>
      fetchApi('/api/migration/verify-mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}

export function usePreflight() {
  return useMutation<PreflightResult, Error, { destinationPath: string }>({
    mutationFn: (data) =>
      fetchApi('/api/migration/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}

export function useStartMigration() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, { destinationPath: string; updateDataRoot: boolean }>({
    mutationFn: (data) =>
      fetchApi('/api/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-status'] });
    },
  });
}

export function useCancelMigration() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error>({
    mutationFn: () =>
      fetchApi('/api/migration/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration-status'] });
    },
  });
}
