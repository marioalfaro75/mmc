'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, FolderOpen, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DirectoryBrowser } from './DirectoryBrowser';

interface LocalDirSetupProps {
  onVerified: (path: string) => void;
}

export function LocalDirSetup({ onVerified }: LocalDirSetupProps) {
  const [dirPath, setDirPath] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<{
    exists: boolean;
    writable: boolean;
    freeSpace: string | null;
  } | null>(null);

  const handleVerify = async () => {
    if (!dirPath) {
      toast.error('Enter a directory path');
      return;
    }
    setVerifying(true);
    setStatus(null);
    try {
      const res = await fetch('/api/migration/verify-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Verification failed');
        return;
      }
      setStatus({ exists: data.exists, writable: data.writable, freeSpace: data.freeSpace });
      if (data.exists && data.writable) {
        toast.success('Directory verified');
        onVerified(dirPath);
      } else if (!data.exists) {
        toast.error('Directory does not exist');
      } else {
        toast.warning('Directory is not writable');
      }
    } catch {
      toast.error('Failed to verify directory');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Local Directory
        </CardTitle>
      </CardHeader>
      <div className="p-6 pt-0 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Directory Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dirPath}
              onChange={(e) => { setDirPath(e.target.value); setStatus(null); }}
              placeholder="/mnt/storage"
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
            <button
              onClick={() => setShowBrowser(!showBrowser)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              title="Browse directories"
            >
              <Search className="h-4 w-4" />
              Browse
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            An existing directory on this machine (e.g. a second drive, external USB, or any local path).
            Type a path or click Browse to navigate.
          </p>
        </div>

        {showBrowser && (
          <DirectoryBrowser
            onSelect={(path) => { setDirPath(path); setShowBrowser(false); setStatus(null); }}
            onClose={() => setShowBrowser(false)}
          />
        )}

        <button
          onClick={handleVerify}
          disabled={verifying || !dirPath}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {verifying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Verify Directory
        </button>

        {status && (
          <div className="flex items-center gap-3">
            {status.exists ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Exists
              </Badge>
            ) : (
              <Badge variant="danger" className="flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Not Found
              </Badge>
            )}
            {status.exists && (
              status.writable ? (
                <Badge variant="success" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Writable
                </Badge>
              ) : (
                <Badge variant="warning" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Read-only
                </Badge>
              )
            )}
            {status.freeSpace && (
              <span className="text-sm text-muted-foreground">
                {status.freeSpace} free
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
