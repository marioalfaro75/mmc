'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, Circle, Ban } from 'lucide-react';

interface MigrationStep {
  step: string;
  status: string;
  message?: string;
  startedAt?: number;
  completedAt?: number;
}

interface RsyncProgress {
  percentage: number;
  bytesTransferred: number;
  totalBytes: number;
  filesTransferred: number;
  totalFiles: number;
  speed: string;
  eta: string;
}

interface MigrationProgressProps {
  steps: MigrationStep[];
  currentStep: number;
  rsyncProgress: RsyncProgress | null;
  phase: string;
  error: string | null;
  onCancel: () => void;
  cancelling: boolean;
  onDismiss?: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return <span className="text-xs text-muted-foreground ml-2">({formatElapsed(now - startedAt)})</span>;
}

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'running':
      return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
    case 'skipped':
      return <Ban className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />;
  }
}

export function MigrationProgress({
  steps,
  currentStep,
  rsyncProgress,
  phase,
  error,
  onCancel,
  cancelling,
  onDismiss,
}: MigrationProgressProps) {
  return (
    <div className="space-y-6">
      {/* Step List */}
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-md p-3 ${
              i === currentStep ? 'bg-muted' : ''
            }`}
          >
            <StepIcon status={step.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center">
                <p className="text-sm font-medium">{step.step}</p>
                {step.status === 'running' && step.startedAt && (
                  <ElapsedTimer startedAt={step.startedAt} />
                )}
              </div>
              {step.message && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rsync Progress Bar */}
      {rsyncProgress && phase === 'migrating' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Copying files...</span>
            <span className="font-medium">{rsyncProgress.percentage}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${rsyncProgress.percentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatBytes(rsyncProgress.bytesTransferred)}
              {rsyncProgress.totalBytes > 0 && ` / ${formatBytes(rsyncProgress.totalBytes)}`}
              {rsyncProgress.filesTransferred > 0 && (
                <> — {rsyncProgress.filesTransferred.toLocaleString()}
                  {rsyncProgress.totalFiles > 0
                    ? ` / ${rsyncProgress.totalFiles.toLocaleString()} files`
                    : ' files'}
                </>
              )}
            </span>
            <span>{rsyncProgress.speed} — ETA {rsyncProgress.eta}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && phase === 'error' && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-4">
          <p className="text-sm text-red-500">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Files already copied remain on the destination. You can retry failed steps.
          </p>
        </div>
      )}

      {/* Cancelled */}
      {phase === 'cancelled' && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4">
          <p className="text-sm text-yellow-600">Migration cancelled. Partially copied files remain on the destination.</p>
        </div>
      )}

      {/* Complete */}
      {phase === 'complete' && (
        <div className="rounded-md bg-green-500/10 border border-green-500/20 p-4">
          <p className="text-sm text-green-500 font-medium">Migration complete</p>
          <p className="text-xs text-muted-foreground mt-1">
            All media has been moved and Sonarr/Radarr paths updated. Consider restarting services from the System page.
          </p>
        </div>
      )}

      {/* Cancel Button */}
      {phase === 'migrating' && (
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="rounded-md border border-red-500/50 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
        >
          {cancelling ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cancelling...
            </span>
          ) : (
            'Cancel Migration'
          )}
        </button>
      )}

      {/* Dismiss Button — return to pre-flight view after completion/error/cancel */}
      {onDismiss && (phase === 'complete' || phase === 'error' || phase === 'cancelled') && (
        <button
          onClick={onDismiss}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
