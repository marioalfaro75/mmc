'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  ArrowRight, FolderSync,
} from 'lucide-react';
import { toast } from 'sonner';
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

  const preflight = usePreflight();
  const startMigration = useStartMigration();
  const cancelMigration = useCancelMigration();

  // Poll status when migration is running
  const { data: status } = useMigrationStatus(
    preflightRun && (startMigration.isSuccess || false)
  );

  const isRunning = status?.running || false;
  const phase = status?.phase || 'idle';

  // Auto-poll when there's an active migration
  const { data: activeStatus } = useMigrationStatus(true);
  const hasActiveMigration = activeStatus?.running || (activeStatus?.phase && activeStatus.phase !== 'idle');

  const displayStatus = hasActiveMigration ? activeStatus : status;

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
        toast.success('Migration started');
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

  // If there's an active migration, show progress directly
  if (hasActiveMigration && displayStatus) {
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
            steps={displayStatus.steps}
            currentStep={displayStatus.currentStep}
            rsyncProgress={displayStatus.rsyncProgress}
            phase={displayStatus.phase}
            error={displayStatus.error}
            onCancel={handleCancel}
            cancelling={cancelMigration.isPending}
          />
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
            <code className="rounded bg-muted px-2 py-0.5">{mountPoint}/media</code>
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
              Also update DATA_ROOT in .env (new downloads will go to NAS too)
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
                  This will copy all media from the current location to the NAS and update Sonarr/Radarr paths.
                  The process may take a while depending on library size and network speed.
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

      {/* Migration Progress (after started) */}
      {displayStatus && displayStatus.phase !== 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Migration Progress</CardTitle>
          </CardHeader>
          <div className="p-6 pt-0">
            <MigrationProgress
              steps={displayStatus.steps}
              currentStep={displayStatus.currentStep}
              rsyncProgress={displayStatus.rsyncProgress}
              phase={displayStatus.phase}
              error={displayStatus.error}
              onCancel={handleCancel}
              cancelling={cancelMigration.isPending}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
