import { NextResponse } from 'next/server';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { readEnv } from '@/lib/env';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

function getBackupDir(): string {
  const vars = readEnv();
  let dir = vars.BACKUP_DIR || `${process.env.HOME}/.mmc/backups`;
  if (dir.startsWith('~')) dir = `${process.env.HOME}${dir.slice(1)}`;
  return dir;
}

function validateFilename(filename: string): boolean {
  // Only allow valid backup filenames — prevent path traversal
  return /^mars-media-centre-backup-\d{4}-\d{2}-\d{2}-\d{6}\.tar\.gz$/.test(filename);
}

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
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

  try {
    const data = readFileSync(filepath);
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(data.length),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read backup file', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
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

  try {
    unlinkSync(filepath);
    return NextResponse.json({ status: 'deleted', filename });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete backup', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
