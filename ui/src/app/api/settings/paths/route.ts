import { NextResponse } from 'next/server';
import { readEnv, writeEnv } from '@/lib/env';
import { requireAdmin } from '@/lib/auth';

const PATH_KEYS = ['DATA_ROOT', 'CONFIG_ROOT', 'BACKUP_DIR'] as const;

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const vars = readEnv();
    const paths: Record<string, string> = {};
    for (const key of PATH_KEYS) {
      paths[key] = vars[key] || '';
    }
    return NextResponse.json(paths);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read .env file', details: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();

    // Validate: only allow PATH_KEYS, values must be absolute paths
    for (const key of PATH_KEYS) {
      const value = body[key];
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        return NextResponse.json(
          { error: `${key} must be a string` },
          { status: 400 }
        );
      }
      if (!value.startsWith('/')) {
        return NextResponse.json(
          { error: `${key} must be an absolute path (start with /)` },
          { status: 400 }
        );
      }
      if (value.includes('..')) {
        return NextResponse.json(
          { error: `${key} must not contain ".."` },
          { status: 400 }
        );
      }
    }

    const toWrite: Record<string, string> = {};
    for (const key of PATH_KEYS) {
      if (body[key] !== undefined) toWrite[key] = body[key];
    }

    writeEnv(toWrite);

    // Return updated paths
    const vars = readEnv();
    const paths: Record<string, string> = {};
    for (const key of PATH_KEYS) {
      paths[key] = vars[key] || '';
    }
    return NextResponse.json(paths);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update .env file', details: String(err) },
      { status: 500 }
    );
  }
}
