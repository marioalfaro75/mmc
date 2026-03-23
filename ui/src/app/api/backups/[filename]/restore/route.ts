import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

const execFileAsync = promisify(execFile);

function getBackupDir(): string {
  const vars = readEnv();
  let dir = vars.BACKUP_DIR || `${process.env.HOME}/.mmc/backups`;
  if (dir.startsWith('~')) dir = `${process.env.HOME}${dir.slice(1)}`;
  return dir;
}

function validateFilename(filename: string): boolean {
  return /^mars-media-centre-backup-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz$/.test(filename);
}

function composeArgs(): string[] {
  const projectDir = process.env.HOST_PROJECT_DIR;
  if (!projectDir) throw new Error('HOST_PROJECT_DIR is not set');
  return [
    'compose',
    '-f', `${projectDir}/docker-compose.yml`,
    '--project-directory', projectDir,
    '--env-file', `${projectDir}/.env`,
  ];
}

export async function POST(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const denied = requireAdmin(_request);
  if (denied) return denied;

  const { filename } = await params;

  if (!validateFilename(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const filepath = join(getBackupDir(), filename);

  if (!existsSync(filepath)) {
    return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  }

  const vars = readEnv();
  let configRoot = vars.CONFIG_ROOT || `${process.env.HOME}/.mmc/config`;
  if (configRoot.startsWith('~')) configRoot = `${process.env.HOME}${configRoot.slice(1)}`;
  const puid = vars.PUID || '1000';
  const pgid = vars.PGID || '1000';

  try {
    logger.info('restore', `Starting restore from: ${filename}`);

    // Step 1: Stop all services except media-ui (best-effort)
    const allServices = [
      'gluetun', 'qbittorrent', 'sabnzbd', 'unpackerr', 'prowlarr',
      'sonarr', 'radarr', 'bazarr', 'seerr',
      'recyclarr', 'watchtower',
    ];
    try {
      const stopArgs = [...composeArgs(), 'stop', ...allServices];
      await execFileAsync('docker', stopArgs, { timeout: 60000 });
    } catch {
      logger.warn('restore', 'Could not stop services before restore (may not be running)');
    }

    // Step 2: Extract backup over CONFIG_ROOT
    const configParent = dirname(configRoot);
    await execFileAsync('tar', ['-xzf', filepath, '--no-same-owner', '-C', configParent], { timeout: 120000 });
    logger.info('restore', 'Backup extracted successfully');

    // Step 3: Fix ownership (best-effort)
    await execFileAsync('chown', ['-R', `${puid}:${pgid}`, configRoot], { timeout: 30000 }).catch(() => {
      logger.warn('restore', 'Could not fix ownership (may need sudo)');
    });

    // Step 4: Start all services back up (best-effort)
    let restartWarning: string | undefined;
    try {
      const startArgs = [...composeArgs(), 'start', ...allServices];
      await execFileAsync('docker', startArgs, { timeout: 120000 });
    } catch (restartErr) {
      restartWarning = 'Config restored but services could not be restarted automatically. Use Service Control to restart them.';
      logger.warn('restore', 'Could not restart services after restore', { error: String(restartErr) });
    }

    logger.info('restore', `Restore completed from: ${filename}`);
    return NextResponse.json({
      status: 'restored',
      filename,
      ...(restartWarning ? { warning: restartWarning } : {}),
    });
  } catch (err) {
    logger.error('restore', `Restore failed from: ${filename}`, { error: String(err) });
    // Try to restart services even if restore had issues
    try {
      const startArgs = [...composeArgs(), 'up', '-d'];
      await execFileAsync('docker', startArgs, { timeout: 120000 });
    } catch {
      // best effort
    }

    return NextResponse.json(
      { error: 'Restore failed', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
