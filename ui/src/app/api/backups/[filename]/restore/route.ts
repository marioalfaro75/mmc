import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readEnv } from '@/lib/env';

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
    // Step 1: Stop all services except media-ui
    const allServices = [
      'gluetun', 'qbittorrent', 'sabnzbd', 'unpackerr', 'prowlarr',
      'sonarr', 'radarr', 'plex', 'bazarr', 'tautulli', 'seerr',
      'recyclarr', 'watchtower',
    ];
    const stopArgs = [...composeArgs(), 'stop', ...allServices];
    await execFileAsync('docker', stopArgs, { timeout: 60000 }).catch(() => {
      // Some services may not be running — that's OK
    });

    // Step 2: Extract backup over CONFIG_ROOT
    const configParent = require('path').dirname(configRoot);
    await execFileAsync('tar', ['-xzf', filepath, '-C', configParent], { timeout: 120000 });

    // Step 3: Fix ownership
    await execFileAsync('chown', ['-R', `${puid}:${pgid}`, configRoot], { timeout: 30000 }).catch(() => {
      // May fail without sudo — non-critical
    });

    // Step 4: Start all services back up
    const startArgs = [...composeArgs(), 'start', ...allServices];
    await execFileAsync('docker', startArgs, { timeout: 120000 });

    return NextResponse.json({ status: 'restored', filename });
  } catch (err) {
    // Try to restart services even if restore had issues
    try {
      const startArgs = [...composeArgs(), 'up', '-d'];
      await execFileAsync('docker', startArgs, { timeout: 120000 });
    } catch {
      // best effort
    }

    return NextResponse.json(
      { error: 'Restore failed', details: String(err) },
      { status: 500 }
    );
  }
}
