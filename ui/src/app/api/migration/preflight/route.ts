import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSeries, getRootFolders as getSonarrRootFolders } from '@/lib/api/sonarr';
import { getMovies, getRootFolders as getRadarrRootFolders } from '@/lib/api/radarr';
import { getQueue as getSonarrQueue } from '@/lib/api/sonarr';
import { getQueue as getRadarrQueue } from '@/lib/api/radarr';
import { sanitizeError } from '@/lib/security';
import { readEnv } from '@/lib/env';
import { requireAdmin } from '@/lib/auth';
import { isValidPath } from '@/lib/shell-safe';

const execFileAsync = promisify(execFile);

// Run a tool inside an alpine container with bindPath bind-mounted. argv is
// passed as docker arguments, never through a shell, so user-supplied paths
// can't escape their argv slot.
async function runOnHost(argv: string[], bindPath: string, timeoutMs = 15000): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'run', '--rm', '--net=host',
    '-v', `${bindPath}:${bindPath}`,
    'alpine', ...argv,
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
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { destinationPath } = await request.json();

    if (!destinationPath || typeof destinationPath !== 'string') {
      return NextResponse.json({ success: false, error: 'Destination path is required' }, { status: 400 });
    }
    if (!isValidPath(destinationPath) || !destinationPath.startsWith('/')) {
      return NextResponse.json({ success: false, error: 'Invalid destination path' }, { status: 400 });
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

    // Check Bazarr connectivity (optional). Bazarr's LinuxServer image takes
    // 30-60s to fully initialise, so retry a few times before giving up.
    const bazarrKey = process.env.BAZARR_API_KEY;
    if (bazarrKey) {
      const { getSystemStatus } = await import('@/lib/api/bazarr');
      let bazarrErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await getSystemStatus();
          bazarrErr = null;
          break;
        } catch (e) {
          bazarrErr = e;
          if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!bazarrErr) {
        checks.push({ check: 'bazarr', status: 'ok', message: 'Bazarr connected' });
      } else {
        checks.push({
          check: 'bazarr',
          status: 'warn',
          message: 'Cannot reach Bazarr — subtitle root folders will need manual update',
          detail: sanitizeError(bazarrErr),
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
          message: `${activeCount} active download(s) — pause downloads before migrating to avoid incomplete files`,
        });
      } else {
        checks.push({ check: 'active-downloads', status: 'ok', message: 'No active downloads' });
      }
    } catch {
      checks.push({ check: 'active-downloads', status: 'warn', message: 'Could not check download queues' });
    }

    // Check destination mount and space — runs on the host. awk with -v passes
    // destinationPath as a script variable, not as shell text.
    try {
      await runOnHost(
        ['awk', '-v', `t=${destinationPath}`, '$2 == t { found=1 } END { exit !found }', '/proc/mounts'],
        destinationPath,
      );
      checks.push({ check: 'destination-mounted', status: 'ok', message: `${destinationPath} is mounted` });
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
      const dfOutput = await runOnHost(['df', '-B1', destinationPath], destinationPath, 20000);
      const lastDfLine = dfOutput.trim().split('\n').pop() || '';
      const parts = lastDfLine.split(/\s+/);
      const availBytes = parseInt(parts[3], 10);

      // Get source size from DATA_ROOT/media on the host. If the directory
      // is missing du exits non-zero; treat that as 0 bytes. Guard against
      // a DATA_ROOT in .env containing shell metacharacters — the path goes
      // to docker's `-v` argument which would barf, but better to bail fast.
      let duOut = '0\t';
      if (isValidPath(resolvedDataRoot) && resolvedDataRoot.startsWith('/')) {
        try {
          duOut = await runOnHost(['du', '-sb', `${resolvedDataRoot}/media`], resolvedDataRoot, 30000);
        } catch {
          duOut = '0\t';
        }
      }
      try {
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
