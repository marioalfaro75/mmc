'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/lib/utils/fetchApi';

interface MigrationStatus {
  running: boolean;
  phase: 'idle' | 'migrating' | 'complete' | 'error' | 'cancelled';
  steps: { step: string; status: string; message?: string }[];
  currentStep: number;
  rsyncProgress: {
    percentage: number;
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

interface TestConnectionResult {
  success: boolean;
  reachable?: boolean;
  shareFound?: boolean | null;
  availableShares?: string[];
  shareError?: string | null;
  message?: string;
  error?: string;
}

export function useMigrationStatus(enabled: boolean) {
  return useQuery<MigrationStatus>({
    queryKey: ['migration-status'],
    queryFn: () => fetchApi('/api/migration/status'),
    refetchInterval: enabled ? 2000 : false,
    staleTime: 1000,
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
