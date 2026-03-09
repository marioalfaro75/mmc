'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Archive, Download, RotateCcw, Trash2, Loader2,
  RefreshCw, AlertTriangle, HardDrive, Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Modal } from '@/components/common/Modal';
import { toast } from 'sonner';

interface BackupInfo {
  filename: string;
  date: string;
  size: string;
  sizeBytes: number;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Unknown';
  // dateStr is YYYY-MM-DD-HHMMSS
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!match) return dateStr;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

export function BackupsTab() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupDir, setBackupDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
        setBackupDir(data.backupDir);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const createBackup = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/backups', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
        toast.success('Backup created successfully');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Backup failed');
      }
    } catch {
      toast.error('Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const downloadBackup = (filename: string) => {
    const link = document.createElement('a');
    link.href = `/api/backups/${filename}`;
    link.download = filename;
    link.click();
  };

  const deleteBackup = async (filename: string) => {
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/backups/${filename}`, { method: 'DELETE' });
      if (res.ok) {
        setBackups((prev) => prev.filter((b) => b.filename !== filename));
        toast.success('Backup deleted');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete backup');
      }
    } catch {
      toast.error('Failed to delete backup');
    }
  };

  const restoreBackup = async (filename: string) => {
    setConfirmRestore(null);
    setRestoring(filename);
    try {
      const res = await fetch(`/api/backups/${filename}/restore`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.warning) {
          toast.warning(data.warning);
        } else {
          toast.success('Restore complete — services restarted');
        }
      } else {
        toast.error(data.error || 'Restore failed');
      }
    } catch {
      toast.error('Failed to restore backup');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Create Backup
          </CardTitle>
        </CardHeader>
        <p className="mb-3 text-xs text-muted-foreground">
          Back up all service configurations (databases, settings, API keys, quality profiles).
          Media files and the <code className="rounded bg-muted px-1 font-mono">.env</code> file are not included.
        </p>
        <button
          onClick={createBackup}
          disabled={creating}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Backing up...
            </>
          ) : (
            <>
              <HardDrive className="h-4 w-4" />
              Back Up Now
            </>
          )}
        </button>
      </Card>

      {/* Existing Backups */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Backups</CardTitle>
          <button
            onClick={loadBackups}
            className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </CardHeader>

        {backupDir && (
          <p className="mb-3 text-xs text-muted-foreground">
            Stored in <code className="rounded bg-muted px-1 font-mono">{backupDir}</code>
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : backups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No backups found. Create one above.
          </p>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.filename}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{backup.filename}</p>
                    <Badge variant="outline">{backup.size}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(backup.date)}
                  </p>
                </div>

                <div className="ml-4 flex items-center gap-1.5">
                  {restoring === backup.filename ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Restoring...
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => downloadBackup(backup.filename)}
                        className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmRestore(backup.filename)}
                        disabled={!!restoring}
                        className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(backup.filename)}
                        disabled={!!restoring}
                        className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-danger disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            About Backups
          </CardTitle>
        </CardHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">What&apos;s backed up:</strong> All service configuration
            directories from <code className="rounded bg-muted px-1 font-mono">CONFIG_ROOT</code> —
            databases, settings, API keys, quality profiles, indexer configs.
          </p>
          <p>
            <strong className="text-foreground">What&apos;s NOT backed up:</strong> Media files
            (movies, TV shows, downloads), the <code className="rounded bg-muted px-1 font-mono">.env</code> file,
            Docker images, or the repository source code.
          </p>
          <p>
            <strong className="text-foreground">Rotation:</strong> When creating backups via the CLI
            script (<code className="rounded bg-muted px-1 font-mono">./scripts/backup.sh</code>),
            only the 7 most recent backups are kept. Older backups are automatically deleted.
          </p>
          <p>
            <strong className="text-foreground">Automated backups:</strong> Add a cron job to run backups
            on a schedule:
          </p>
          <pre className="rounded-md bg-muted p-3 text-xs">
            0 3 * * * /path/to/mmc/scripts/backup.sh
          </pre>
        </div>
      </Card>

      {/* Restore confirmation modal */}
      <Modal
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title="Restore from Backup"
      >
        <div className="mb-3 flex items-start gap-2 rounded-md border border-danger/50 bg-danger/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="text-xs text-danger">
            <p className="font-medium">This action will:</p>
            <ul className="ml-4 mt-1 list-disc">
              <li>Stop all services (except the web UI)</li>
              <li>Overwrite all service configurations with the backup</li>
              <li>Restart all services</li>
            </ul>
            <p className="mt-1">Current service settings will be lost.</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Restore from <strong>{confirmRestore}</strong>?
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => confirmRestore && restoreBackup(confirmRestore)}
            className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90"
          >
            <RotateCcw className="h-4 w-4" />
            Restore
          </button>
          <button
            onClick={() => setConfirmRestore(null)}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Backup"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Permanently delete <strong>{confirmDelete}</strong>? This cannot be undone.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => confirmDelete && deleteBackup(confirmDelete)}
            className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(null)}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
