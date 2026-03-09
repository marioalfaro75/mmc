import { NextResponse } from 'next/server';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readEnv } from '@/lib/env';

const execFileAsync = promisify(execFile);

function getBackupDir(): string {
  const vars = readEnv();
  let dir = vars.BACKUP_DIR || `${process.env.HOME}/.mmc/backups`;
  // Expand ~ to HOME
  if (dir.startsWith('~')) dir = `${process.env.HOME}${dir.slice(1)}`;
  return dir;
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
      // Parse date from filename: mars-media-centre-backup-YYYY-MM-DD-HHMMSS.tar.gz
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

export async function GET() {
  try {
    const dir = getBackupDir();
    const backups = listBackups(dir);
    return NextResponse.json({ backups, backupDir: dir });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list backups', details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST() {
  const projectDir = process.env.HOST_PROJECT_DIR;

  if (!projectDir) {
    return NextResponse.json(
      { error: 'HOST_PROJECT_DIR is not set' },
      { status: 500 }
    );
  }

  const backupScript = `${projectDir}/scripts/backup.sh`;

  try {
    const { stdout } = await execFileAsync('sh', [backupScript], {
      timeout: 120000,
      env: { ...process.env, HOME: process.env.HOME },
    });

    // Reload the list after backup
    const dir = getBackupDir();
    const backups = listBackups(dir);

    return NextResponse.json({ status: 'complete', output: stdout, backups });
  } catch (err) {
    return NextResponse.json(
      { error: 'Backup failed', details: String(err) },
      { status: 500 }
    );
  }
}
