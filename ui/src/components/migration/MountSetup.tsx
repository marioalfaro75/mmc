'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  Copy, Check, HardDrive, Wifi, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useTestConnection, useGenerateMount, useVerifyMount,
  useVerifyNasVolume, useSetupNasVolume,
} from '@/hooks/useMigration';

interface MountSetupProps {
  onMountVerified: (mountPoint: string) => void;
}

export function MountSetup({ onMountVerified }: MountSetupProps) {
  const [setupMode, setSetupMode] = useState<'managed' | 'script'>('managed');
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
  const [managedStatus, setManagedStatus] = useState<{
    phase: 'idle' | 'verifying' | 'configuring' | 'reconnecting' | 'done' | 'error';
    message?: string;
  }>({ phase: 'idle' });

  const testConnection = useTestConnection();
  const generateMount = useGenerateMount();
  const verifyMount = useVerifyMount();
  const verifyNasVolume = useVerifyNasVolume();
  const setupNasVolume = useSetupNasVolume();

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

          if (data.authFailed) {
            toast.error('Authentication failed — check the SMB username and password');
          } else if (data.reachable && data.shareFound === true) {
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

  // Wait for the UI server to come back online after the self-restart sidecar
  // recreates media-ui with the new volume mount.
  const waitForMediaUiReady = async (timeoutMs = 60000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch('/api/migration/setup-nas-volume', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.active) return true;
        }
      } catch {
        // server still restarting — keep polling
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };

  const handleConfigureManaged = async () => {
    if (!host || !sharePath) {
      toast.error('Enter host and share path first');
      return;
    }
    if (protocol === 'smb' && !smbUser) {
      toast.error('SMB requires a username');
      return;
    }

    const payload = {
      protocol: protocol as 'smb' | 'nfs',
      host,
      sharePath,
      smbUser: smbUser || undefined,
      smbPassword: smbPassword || undefined,
    };

    // Step 1: verify the volume options actually mount and write
    setManagedStatus({ phase: 'verifying', message: 'Testing NAS volume mount...' });
    let verifyResult;
    try {
      verifyResult = await verifyNasVolume.mutateAsync(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification request failed';
      setManagedStatus({ phase: 'error', message: msg });
      toast.error(msg);
      return;
    }
    if (!verifyResult.success) {
      setManagedStatus({ phase: 'error', message: verifyResult.error || 'Volume verification failed' });
      toast.error(verifyResult.error || 'Volume verification failed');
      return;
    }
    toast.success(`Volume verified — ${verifyResult.freeSpace} free`);

    // Step 2: write the override file, update .env, recreate sonarr/radarr/bazarr,
    // schedule media-ui restart
    setManagedStatus({ phase: 'configuring', message: 'Writing config and recreating services...' });
    let setupResult;
    try {
      setupResult = await setupNasVolume.mutateAsync(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Setup request failed';
      setManagedStatus({ phase: 'error', message: msg });
      toast.error(msg);
      return;
    }
    if (!setupResult.success) {
      setManagedStatus({ phase: 'error', message: setupResult.error || 'Setup failed' });
      toast.error(setupResult.error || 'Setup failed');
      return;
    }

    // Step 3: wait for media-ui to come back after self-restart
    setManagedStatus({ phase: 'reconnecting', message: 'media-ui is restarting — reconnecting...' });
    const ready = await waitForMediaUiReady(90000);
    if (!ready) {
      setManagedStatus({
        phase: 'error',
        message: 'Timed out waiting for media-ui to restart. Try refreshing the page.',
      });
      toast.error('media-ui did not come back in time — refresh the page');
      return;
    }

    setManagedStatus({ phase: 'done', message: 'NAS volume is configured and active.' });
    toast.success('NAS volume configured');
    onMountVerified(setupResult.mountPath || '/mnt/nas/media');
  };

  return (
    <div className="space-y-6">
      {/* Setup mode selector */}
      <Card>
        <div className="p-6 space-y-3">
          <p className="text-sm font-medium">How should containers access the NAS?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSetupMode('managed')}
              className={`text-left rounded-md border p-4 transition ${
                setupMode === 'managed' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Managed Volume (recommended)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Docker mounts the share directly per container. No host mount, no sudo, works on WSL2.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSetupMode('script')}
              className={`text-left rounded-md border p-4 transition ${
                setupMode === 'script' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="h-4 w-4" />
                <span className="font-medium text-sm">Host Mount Script</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Generates a bash script you run with sudo to mount via fstab. Legacy mode.
              </p>
            </button>
          </div>
        </div>
      </Card>

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
              {testConnection.data.shareError && testConnection.data.authFailed && (
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-red-500 font-medium">{testConnection.data.shareError}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Update the SMB username and password above, then click Test Connection again.
                    </p>
                  </div>
                </div>
              )}
              {testConnection.data.shareError && !testConnection.data.authFailed && (
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

          {/* Mount Point — only relevant for script mode */}
          {setupMode === 'script' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Local Mount Point</label>
              <input
                type="text"
                value={mountPoint}
                onChange={(e) => setMountPoint(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Action button — different per mode */}
          {setupMode === 'managed' ? (
            <>
              <button
                onClick={handleConfigureManaged}
                disabled={
                  verifyNasVolume.isPending || setupNasVolume.isPending ||
                  managedStatus.phase === 'reconnecting' ||
                  !host || !sharePath || (protocol === 'smb' && !smbUser)
                }
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {managedStatus.phase === 'verifying' && (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying volume...
                  </span>
                )}
                {managedStatus.phase === 'configuring' && (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Configuring services...
                  </span>
                )}
                {managedStatus.phase === 'reconnecting' && (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reconnecting to media-ui...
                  </span>
                )}
                {(managedStatus.phase === 'idle' || managedStatus.phase === 'done' || managedStatus.phase === 'error') && (
                  'Configure NAS Volume'
                )}
              </button>

              {managedStatus.phase === 'done' && (
                <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {managedStatus.message}
                  </div>
                </div>
              )}
              {managedStatus.phase === 'error' && managedStatus.message && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3">
                  <div className="flex items-start gap-2 text-sm text-red-500">
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{managedStatus.message}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
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
          )}
        </div>
      </Card>

      {/* Mount Command — only in script mode */}
      {setupMode === 'script' && generatedCommand && (
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
