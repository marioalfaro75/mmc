'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  Copy, Check, HardDrive, Wifi,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTestConnection, useGenerateMount, useVerifyMount } from '@/hooks/useMigration';

interface MountSetupProps {
  onMountVerified: (mountPoint: string) => void;
}

export function MountSetup({ onMountVerified }: MountSetupProps) {
  const [protocol, setProtocol] = useState('smb');
  const [host, setHost] = useState('');
  const [sharePath, setSharePath] = useState('');
  const [mountPoint, setMountPoint] = useState('/mnt/nas/media');
  const [smbUser, setSmbUser] = useState('');
  const [smbPassword, setSmbPassword] = useState('');
  const [generatedCommand, setGeneratedCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [mountStatus, setMountStatus] = useState<{
    mounted: boolean;
    writable: boolean;
    freeSpace: string | null;
  } | null>(null);

  const testConnection = useTestConnection();
  const generateMount = useGenerateMount();
  const verifyMount = useVerifyMount();

  const [discoveredShares, setDiscoveredShares] = useState<string[]>([]);

  const handleTestConnection = () => {
    if (!host) {
      toast.error('Enter a NAS hostname or IP first');
      return;
    }
    testConnection.mutate(
      { host, protocol, sharePath: sharePath || undefined, smbUser: smbUser || undefined, smbPassword: smbPassword || undefined },
      {
        onSuccess: (data) => {
          // Store discovered shares
          if (data.availableShares && data.availableShares.length > 0) {
            setDiscoveredShares(data.availableShares);
          }

          if (data.reachable && data.shareFound === true) {
            toast.success(`${host} is reachable and share path found`);
          } else if (data.reachable && data.shareFound === false) {
            toast.warning(`${host} is reachable but share path not found`);
          } else if (data.reachable) {
            toast.success(`${host} is reachable`);
          } else {
            toast.warning(data.message || 'Host not reachable');
          }
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleGenerateMount = () => {
    if (!host || !sharePath || !mountPoint) {
      toast.error('Fill in all required fields');
      return;
    }
    generateMount.mutate(
      { protocol, host, sharePath, mountPoint, smbUser, smbPassword },
      {
        onSuccess: (data) => {
          setGeneratedCommand(data.command);
          toast.success('Mount script generated');
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleVerifyMount = () => {
    verifyMount.mutate({ mountPoint }, {
      onSuccess: (data) => {
        setMountStatus({
          mounted: data.mounted,
          writable: data.writable,
          freeSpace: data.freeSpace,
        });
        if (data.mounted && data.writable) {
          toast.success('Mount verified');
          onMountVerified(mountPoint);
        } else if (data.mounted) {
          toast.warning('Mount is read-only');
        } else {
          toast.error('Path is not mounted — run the mount command first');
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            NAS Connection
          </CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 space-y-4">
          {/* Protocol */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Protocol</label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="nfs">NFS</option>
              <option value="smb">SMB / CIFS</option>
            </select>
          </div>

          {/* Host */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">NAS IP or Hostname</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.100"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          {/* SMB Credentials — shown early so they're available for Test */}
          {protocol === 'smb' && (
            <div className="space-y-4 rounded-md border border-border p-4">
              <p className="text-sm font-medium text-foreground">SMB Credentials</p>
              <p className="text-xs text-muted-foreground">Required to list shares and mount. Leave blank for guest access.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Username</label>
                  <input
                    type="text"
                    value={smbUser}
                    onChange={(e) => setSmbUser(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Password</label>
                  <input
                    type="password"
                    value={smbPassword}
                    onChange={(e) => setSmbPassword(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Test Connection & Discover Shares */}
          <div>
            <button
              onClick={handleTestConnection}
              disabled={testConnection.isPending || !host}
              className="flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
            >
              {testConnection.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              Test Connection & Discover Shares
            </button>
          </div>

          {/* Test Results */}
          {testConnection.data && (
            <div className="rounded-md bg-muted p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {testConnection.data.reachable ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                )}
                <span>{testConnection.data.reachable ? 'Host is reachable' : 'Host did not respond to ping'}</span>
              </div>
              {testConnection.data.shareFound === true && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Share path found on NAS</span>
                </div>
              )}
              {testConnection.data.shareFound === false && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>Share path not found — select one below</span>
                </div>
              )}
              {testConnection.data.availableShares && testConnection.data.availableShares.length > 0 && !testConnection.data.shareFound && (
                <div className="ml-6 text-xs text-muted-foreground">
                  {testConnection.data.availableShares.length} share(s) discovered
                </div>
              )}
              {testConnection.data.shareError && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-muted-foreground">{testConnection.data.shareError}</span>
                </div>
              )}
            </div>
          )}

          {/* Share Path */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Share Path on NAS</label>
            {discoveredShares.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={sharePath}
                  onChange={(e) => setSharePath(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Select a share...</option>
                  {discoveredShares.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">or type manually:</span>
                  <input
                    type="text"
                    value={sharePath}
                    onChange={(e) => setSharePath(e.target.value)}
                    placeholder="/volume1/media"
                    className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ) : (
              <input
                type="text"
                value={sharePath}
                onChange={(e) => setSharePath(e.target.value)}
                placeholder="/volume1/media"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            )}
            {!discoveredShares.length && host && !testConnection.data && (
              <p className="mt-1 text-xs text-muted-foreground">
                Click &quot;Test Connection &amp; Discover Shares&quot; to find available shares
              </p>
            )}
          </div>

          {/* Mount Point */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Local Mount Point</label>
            <input
              type="text"
              value={mountPoint}
              onChange={(e) => setMountPoint(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          {/* Generate Script Button */}
          <button
            onClick={handleGenerateMount}
            disabled={generateMount.isPending || !host || !sharePath || !mountPoint}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {generateMount.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </span>
            ) : (
              'Generate Mount Script'
            )}
          </button>
        </div>
      </Card>

      {/* Mount Command */}
      {generatedCommand && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run This Command</CardTitle>
          </CardHeader>
          <div className="p-6 pt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              Open a terminal and run this command to mount the NAS:
            </p>
            <div className="flex items-center gap-2 rounded-md bg-muted p-3 font-mono text-sm">
              <code className="flex-1 break-all">{generatedCommand}</code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded p-1 hover:bg-surface"
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleVerifyMount}
                disabled={verifyMount.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {verifyMount.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  'Verify Mount'
                )}
              </button>

              {mountStatus && (
                <div className="flex items-center gap-3">
                  {mountStatus.mounted ? (
                    <Badge variant="success" className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Mounted
                    </Badge>
                  ) : (
                    <Badge variant="danger" className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Not Mounted
                    </Badge>
                  )}
                  {mountStatus.mounted && (
                    mountStatus.writable ? (
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
                  {mountStatus.freeSpace && (
                    <span className="text-sm text-muted-foreground">
                      {mountStatus.freeSpace} free
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
