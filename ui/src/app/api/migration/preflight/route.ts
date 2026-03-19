import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSeries, getRootFolders as getSonarrRootFolders } from '@/lib/api/sonarr';
import { getMovies, getRootFolders as getRadarrRootFolders } from '@/lib/api/radarr';
import { getQueue as getSonarrQueue } from '@/lib/api/sonarr';
import { getQueue as getRadarrQueue } from '@/lib/api/radarr';
import { sanitizeError } from '@/lib/security';
import { readEnv } from '@/lib/env';

const execFileAsync = promisify(execFile);

// Run a command on the host via a temporary Docker container
async function runOnHost(cmd: string, mountPoint: string, timeoutMs = 15000): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'run', '--rm', '--net=host',
    '-v', `${mountPoint}:${mountPoint}`,
    'alpine', 'sh', '-c', cmd,
  ], { timeout: timeoutMs });
  return stdout;
}

interface PreflightCheck {
  check: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  detail?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { destinationPath } = await request.json();

    if (!destinationPath || typeof destinationPath !== 'string') {
      return NextResponse.json({ success: false, error: 'Destination path is required' }, { status: 400 });
    }

    const checks: PreflightCheck[] = [];

    // Check Sonarr connectivity
    try {
      const series = await getSeries();
      const folders = await getSonarrRootFolders();
      checks.push({
        check: 'sonarr',
        status: 'ok',
        message: `Sonarr connected — ${series.length} series, ${folders.length} root folder(s)`,
      });
    } catch (error) {
      checks.push({
        check: 'sonarr',
        status: 'error',
        message: 'Cannot reach Sonarr',
        detail: sanitizeError(error),
      });
    }

    // Check Radarr connectivity
    try {
      const movies = await getMovies();
      const folders = await getRadarrRootFolders();
      checks.push({
        check: 'radarr',
        status: 'ok',
        message: `Radarr connected — ${movies.length} movies, ${folders.length} root folder(s)`,
      });
    } catch (error) {
      checks.push({
        check: 'radarr',
        status: 'error',
        message: 'Cannot reach Radarr',
        detail: sanitizeError(error),
      });
    }

    // Check Bazarr connectivity (optional)
    const bazarrKey = process.env.BAZARR_API_KEY;
    if (bazarrKey) {
      try {
        const { getSystemStatus } = await import('@/lib/api/bazarr');
        await getSystemStatus();
        checks.push({ check: 'bazarr', status: 'ok', message: 'Bazarr connected' });
      } catch (error) {
        checks.push({
          check: 'bazarr',
          status: 'warn',
          message: 'Cannot reach Bazarr — subtitle root folders will need manual update',
          detail: sanitizeError(error),
        });
      }
    } else {
      checks.push({ check: 'bazarr', status: 'warn', message: 'Bazarr not configured — skipping' });
    }

    // Check active downloads
    try {
      const sonarrQueue = await getSonarrQueue();
      const radarrQueue = await getRadarrQueue();
      const activeCount = (sonarrQueue.records?.length || 0) + (radarrQueue.records?.length || 0);
      if (activeCount > 0) {
        checks.push({
          check: 'active-downloads',
          status: 'warn',
          message: `${activeCount} active download(s) — consider pausing before migration`,
        });
      } else {
        checks.push({ check: 'active-downloads', status: 'ok', message: 'No active downloads' });
      }
    } catch {
      checks.push({ check: 'active-downloads', status: 'warn', message: 'Could not check download queues' });
    }

    // Check destination mount and space — runs on the host
    try {
      const mounts = await runOnHost(`cat /proc/mounts | grep ' ${destinationPath} '`, destinationPath);
      if (mounts.trim().length > 0) {
        checks.push({ check: 'destination-mounted', status: 'ok', message: `${destinationPath} is mounted` });
      } else {
        checks.push({
          check: 'destination-mounted',
          status: 'error',
          message: `${destinationPath} is not a mount point — mount the NAS first`,
        });
      }
    } catch {
      checks.push({
        check: 'destination-mounted',
        status: 'error',
        message: `${destinationPath} is not a mount point — mount the NAS first`,
      });
    }

    // Check disk space — runs on the host
    // Read DATA_ROOT from .env file (not available as container env var)
    let dataRoot = '~/.mmc/data';
    try {
      const envVars = readEnv();
      if (envVars.DATA_ROOT) dataRoot = envVars.DATA_ROOT;
    } catch {
      // Fall back to default
    }
    // Resolve ~ using HOST_PROJECT_DIR to determine the host user's home
    // e.g. HOST_PROJECT_DIR=/home/mario/dev/mmc → home = /home/mario
    let resolvedDataRoot = dataRoot;
    if (dataRoot.startsWith('~')) {
      const hostProjectDir = process.env.HOST_PROJECT_DIR || '';
      // Extract home dir: walk up from project dir to find /home/<user>
      const homeMatch = hostProjectDir.match(/^(\/home\/[^/]+)/);
      const hostHome = homeMatch ? homeMatch[1] : '/root';
      resolvedDataRoot = `${hostHome}${dataRoot.slice(1)}`;
    }

    try {
      const dfOutput = await runOnHost(`df -B1 ${destinationPath} | tail -1`, destinationPath, 20000);
      const parts = dfOutput.trim().split(/\s+/);
      const availBytes = parseInt(parts[3], 10);

      // Get source size from DATA_ROOT/media on the host
      try {
        const duOut = await runOnHost(
          `du -sb ${resolvedDataRoot}/media 2>/dev/null || echo "0\t"`,
          resolvedDataRoot,
          30000
        );
        const sourceBytes = parseInt(duOut.split('\t')[0], 10);

        if (sourceBytes === 0) {
          checks.push({
            check: 'disk-space',
            status: 'ok',
            message: `No existing media to migrate — ${formatBytes(availBytes)} available on destination`,
          });
        } else if (availBytes > sourceBytes * 1.1) {
          checks.push({
            check: 'disk-space',
            status: 'ok',
            message: `Enough space — need ${formatBytes(sourceBytes)}, have ${formatBytes(availBytes)} free`,
          });
        } else {
          checks.push({
            check: 'disk-space',
            status: 'error',
            message: `Not enough space — need ${formatBytes(sourceBytes)}, only ${formatBytes(availBytes)} free`,
          });
        }
      } catch {
        checks.push({
          check: 'disk-space',
          status: 'warn',
          message: `Could not measure source size — ${formatBytes(availBytes)} available on destination`,
        });
      }
    } catch {
      checks.push({ check: 'disk-space', status: 'warn', message: 'Could not check destination disk space' });
    }

    const hasError = checks.some((c) => c.status === 'error');
    return NextResponse.json({ success: !hasError, checks });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
