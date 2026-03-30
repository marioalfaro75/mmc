'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  ArrowRight, FolderSync,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useMigrationStatus, usePreflight, useStartMigration, useCancelMigration,
} from '@/hooks/useMigration';
import { MigrationProgress } from './MigrationProgress';

interface MediaMigrationProps {
  mountPoint: string;
}

export function MediaMigration({ mountPoint }: MediaMigrationProps) {
  const [preflightRun, setPreflightRun] = useState(false);
  const [preflightPassed, setPreflightPassed] = useState(false);
  const [updateDataRoot, setUpdateDataRoot] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [migrationStarted, setMigrationStarted] = useState(false);

  const preflight = usePreflight();
  const startMigration = useStartMigration();
  const cancelMigration = useCancelMigration();
  const queryClient = useQueryClient();

  // Always poll migration status — shows progress for active, completed, or failed migrations
  const { data: migrationStatus } = useMigrationStatus(true);
  const activeMigration = migrationStatus?.phase && migrationStatus.phase !== 'idle';

  // Show progress view when migration was started OR when poll shows non-idle state
  const showProgress = migrationStarted || activeMigration;

  const handlePreflight = () => {
    preflight.mutate({ destinationPath: mountPoint }, {
      onSuccess: (data) => {
        setPreflightRun(true);
        setPreflightPassed(data.success);
        if (data.success) {
          toast.success('All pre-flight checks passed');
        } else {
          toast.error('Some checks failed — review before proceeding');
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleStart = () => {
    startMigration.mutate({ destinationPath: mountPoint, updateDataRoot }, {
      onSuccess: () => {
        setShowConfirm(false);
        setMigrationStarted(true);
        toast.success('Migration started');
        // Force immediate status refetch so UI picks up the running state
        queryClient.invalidateQueries({ queryKey: ['migration-status'] });
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleCancel = () => {
    cancelMigration.mutate(undefined, {
      onSuccess: () => toast.info('Migration cancelled'),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDismiss = () => {
    setMigrationStarted(false);
  };

  // Show progress view when migration is active, completed, errored, or cancelled
  if (showProgress && migrationStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderSync className="h-5 w-5" />
            Media Migration
          </CardTitle>
        </CardHeader>
        <div className="p-6 pt-0">
          <MigrationProgress
            steps={migrationStatus.steps}
            currentStep={migrationStatus.currentStep}
            rsyncProgress={migrationStatus.rsyncProgress}
            phase={migrationStatus.phase}
            error={migrationStatus.error}
            onCancel={handleCancel}
            cancelling={cancelMigration.isPending}
            onDismiss={handleDismiss}
          />
        </div>
      </Card>
    );
  }

  // Show a loading card while waiting for first poll after start
  if (migrationStarted && !migrationStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderSync className="h-5 w-5" />
            Media Migration
          </CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Starting migration...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pre-flight Checks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderSync className="h-5 w-5" />
            Pre-flight Checks
          </CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Source:</span>
            <code className="rounded bg-muted px-2 py-0.5">DATA_ROOT/media</code>
            <ArrowRight className="h-4 w-4" />
            <span>Destination:</span>
            <code className="rounded bg-muted px-2 py-0.5">{mountPoint.endsWith('/media') ? mountPoint : `${mountPoint}/media`}</code>
          </div>

          <button
            onClick={handlePreflight}
            disabled={preflight.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {preflight.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running checks...
              </span>
            ) : (
              'Run Pre-flight Checks'
            )}
          </button>

          {/* Check Results */}
          {preflight.data?.checks && (
            <div className="space-y-2 mt-4">
              {preflight.data.checks.map((check) => (
                <div key={check.check} className="flex items-start gap-2 text-sm">
                  {check.status === 'ok' && <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />}
                  {check.status === 'warn' && <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />}
                  {check.status === 'error' && <XCircle className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />}
                  <div>
                    <span>{check.message}</span>
                    {check.detail && (
                      <p className="text-xs text-muted-foreground">{check.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Start Migration */}
      {preflightRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start Migration</CardTitle>
          </CardHeader>
          <div className="p-6 pt-0 space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={updateDataRoot}
                onChange={(e) => setUpdateDataRoot(e.target.checked)}
                className="rounded border-border"
              />
              Also update DATA_ROOT in .env (future downloads and completed media will go to the new location)
            </label>

            {!preflightPassed && (
              <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
                <p className="text-sm text-yellow-600">
                  Some pre-flight checks failed. You can still proceed, but review the warnings above.
                </p>
              </div>
            )}

            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start Migration
              </button>
            ) : (
              <div className="rounded-md border border-border p-4 space-y-3">
                <p className="text-sm font-medium">Are you sure?</p>
                <p className="text-sm text-muted-foreground">
                  This will move completed media from DATA_ROOT/media to the destination and update Sonarr/Radarr
                  root folders. Source files are removed after verification. Download directories (torrents/usenet)
                  are not moved. The process may take a while depending on library size and network speed.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleStart}
                    disabled={startMigration.isPending}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {startMigration.isPending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting...
                      </span>
                    ) : (
                      'Confirm'
                    )}
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
