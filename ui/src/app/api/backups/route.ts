import { NextResponse } from 'next/server';
import { readdirSync, statSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/security';

const execFileAsync = promisify(execFile);
const MAX_BACKUPS = 7;

function resolvePath(p: string): string {
  if (p.startsWith('~')) return `${process.env.HOME}${p.slice(1)}`;
  return p;
}

function getBackupPaths(): { configRoot: string; backupDir: string } {
  const vars = readEnv();
  return {
    configRoot: resolvePath(vars.CONFIG_ROOT || `${process.env.HOME}/.mmc/config`),
    backupDir: resolvePath(vars.BACKUP_DIR || `${process.env.HOME}/.mmc/backups`),
  };
}

export interface BackupInfo {
  filename: string;
  date: string;
  size: string;
  sizeBytes: number;
}

function listBackups(dir: string): BackupInfo[] {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('mars-media-centre-backup-') && f.endsWith('.tar.gz'))
      .sort()
      .reverse();

    return files.map((filename) => {
      const filepath = join(dir, filename);
      const stat = statSync(filepath);
      const match = filename.match(/backup-(\d{4}-\d{2}-\d{2}-\d{6})/);
      const dateStr = match ? match[1] : '';

      const sizeBytes = stat.size;
      let size: string;
      if (sizeBytes >= 1024 * 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      } else if (sizeBytes >= 1024 * 1024) {
        size = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      } else if (sizeBytes >= 1024) {
        size = `${(sizeBytes / 1024).toFixed(1)} KB`;
      } else {
        size = `${sizeBytes} B`;
      }

      return { filename, date: dateStr, size, sizeBytes };
    });
  } catch {
    return [];
  }
}

function rotateBackups(dir: string): void {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('mars-media-centre-backup-') && f.endsWith('.tar.gz'))
      .sort()
      .reverse();

    for (const old of files.slice(MAX_BACKUPS)) {
      unlinkSync(join(dir, old));
    }
  } catch {
    // non-critical
  }
}

export async function GET() {
  try {
    const { backupDir } = getBackupPaths();
    const backups = listBackups(backupDir);
    return NextResponse.json({ backups, backupDir });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list backups', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const { configRoot, backupDir } = getBackupPaths();

    // Ensure backup directory exists
    mkdirSync(backupDir, { recursive: true });

    // Create timestamped backup
    const now = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `mars-media-centre-backup-${timestamp}.tar.gz`;
    const backupFile = join(backupDir, filename);

    // tar -czf <backup> -C <parent> <dirname>
    await execFileAsync('tar', [
      '-czf', backupFile,
      '-C', dirname(configRoot),
      basename(configRoot),
    ], { timeout: 120000 });

    // Rotate old backups
    rotateBackups(backupDir);

    logger.info('backup', `Backup created: ${filename}`);

    // Return updated list
    const backups = listBackups(backupDir);
    return NextResponse.json({ status: 'complete', filename, backups });
  } catch (err) {
    logger.error('backup', 'Backup failed', { error: String(err) });
    return NextResponse.json(
      { error: 'Backup failed', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
