import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';

const LOG = 'migration';

interface NasVolumeRequest {
  protocol: 'smb' | 'nfs';
  host: string;
  sharePath: string;
  smbUser?: string;
  smbPassword?: string;
  vers?: string;
}

// Run a docker command and capture stdout/stderr
function runDocker(args: string[], timeoutMs = 60000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d; });
    proc.stderr.on('data', (d: Buffer) => { stderr += d; });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

function buildSmbOptions(host: string, sharePath: string, user: string, password: string, vers: string): string[] {
  const puid = process.env.PUID || '1000';
  const pgid = process.env.PGID || '1000';
  // Single -o string with comma-separated key=value pairs
  const opts = [
    `username=${user}`,
    `password=${password}`,
    `uid=${puid}`,
    `gid=${pgid}`,
    'file_mode=0644',
    'dir_mode=0755',
    `vers=${vers}`,
    'iocharset=utf8',
    'soft',
    'nounix',
  ].join(',');
  // sharePath comes in like "/video" — strip the leading slash for CIFS device
  const share = sharePath.replace(/^\/+/, '');
  return [
    '--driver', 'local',
    '--opt', 'type=cifs',
    '--opt', `device=//${host}/${share}`,
    '--opt', `o=${opts}`,
  ];
}

function buildNfsOptions(host: string, sharePath: string): string[] {
  return [
    '--driver', 'local',
    '--opt', 'type=nfs',
    '--opt', `o=addr=${host},rw,vers=4,soft`,
    '--opt', `device=:${sharePath}`,
  ];
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as NasVolumeRequest;
    const { protocol, host, sharePath, smbUser, smbPassword, vers } = body;

    if (!protocol || !host || !sharePath) {
      return NextResponse.json({ success: false, error: 'protocol, host, and sharePath are required' }, { status: 400 });
    }
    if (!['smb', 'nfs'].includes(protocol)) {
      return NextResponse.json({ success: false, error: 'protocol must be smb or nfs' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(host)) {
      return NextResponse.json({ success: false, error: 'Invalid host format' }, { status: 400 });
    }
    if (sharePath.includes('..') || !/^[a-zA-Z0-9/._ -]+$/.test(sharePath)) {
      return NextResponse.json({ success: false, error: 'Invalid share path' }, { status: 400 });
    }

    const tempVolumeName = `mmc-nas-verify-${Date.now()}`;
    logger.info(LOG, `Verifying NAS volume options: ${protocol}://${host}${sharePath}`);

    // Build driver opts
    let driverOpts: string[];
    if (protocol === 'smb') {
      if (!smbUser) {
        return NextResponse.json({ success: false, error: 'SMB requires a username' }, { status: 400 });
      }
      driverOpts = buildSmbOptions(host, sharePath, smbUser, smbPassword || '', vers || '3.0');
    } else {
      driverOpts = buildNfsOptions(host, sharePath);
    }

    // Step 1: Create a temporary volume with the requested options
    const createResult = await runDocker(['volume', 'create', ...driverOpts, tempVolumeName], 15000);
    if (createResult.code !== 0) {
      const err = (createResult.stderr || createResult.stdout || 'unknown error').trim();
      logger.error(LOG, `Volume create failed: ${err}`);
      return NextResponse.json({
        success: false,
        mounted: false,
        writable: false,
        error: `Failed to create volume: ${err}`,
      });
    }

    // Step 2: Spawn a container that mounts the volume and tests it
    let result;
    try {
      result = await runDocker([
        'run', '--rm',
        '-v', `${tempVolumeName}:/data`,
        'alpine', 'sh', '-c',
        'touch /data/.mmc-verify-test 2>&1 && rm -f /data/.mmc-verify-test 2>&1 && df -PB1 /data | tail -1',
      ], 30000);
    } finally {
      // Step 3: Always clean up the temp volume
      await runDocker(['volume', 'rm', '-f', tempVolumeName], 10000);
    }

    if (result.code !== 0) {
      const err = (result.stderr || result.stdout || `exit ${result.code}`).trim();
      logger.error(LOG, `Volume mount/write test failed: ${err}`);

      // Try to give the user a meaningful hint
      let hint = err;
      if (/permission denied/i.test(err)) {
        hint = 'Volume mounted but writes are denied — check uid/gid options or NAS permissions.';
      } else if (/no such device/i.test(err) || /mount error/i.test(err)) {
        hint = 'Failed to mount the share — check host, share path, and credentials.';
      } else if (/host is down|unreachable/i.test(err)) {
        hint = 'Could not reach the NAS host.';
      }

      return NextResponse.json({
        success: false,
        mounted: false,
        writable: false,
        error: hint,
        rawError: err,
      });
    }

    // Parse df output: filesystem 1k-blocks used available capacity mountpoint
    const dfLine = result.stdout.trim().split(/\s+/);
    const totalBytes = parseInt(dfLine[1], 10) || 0;
    const freeBytes = parseInt(dfLine[3], 10) || 0;

    const formatBytes = (bytes: number): string => {
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      let n = bytes;
      while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
      return `${n.toFixed(i > 1 ? 1 : 0)}${units[i]}`;
    };

    logger.info(LOG, `NAS volume verified — free=${formatBytes(freeBytes)}, total=${formatBytes(totalBytes)}`);

    return NextResponse.json({
      success: true,
      mounted: true,
      writable: true,
      freeSpace: formatBytes(freeBytes),
      totalSpace: formatBytes(totalBytes),
      freeBytes,
      totalBytes,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}
