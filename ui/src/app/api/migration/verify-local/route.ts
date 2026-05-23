import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';
import { isValidPath } from '@/lib/shell-safe';

const execFileAsync = promisify(execFile);

async function runOnHost(argv: string[], bindPath: string, timeoutMs = 15000): Promise<string> {
  const { stdout } = await execFileAsync(
    'docker',
    ['run', '--rm', '-v', `${bindPath}:${bindPath}`, 'alpine', ...argv],
    { timeout: timeoutMs },
  );
  return stdout;
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { path } = await request.json();

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }
    if (!isValidPath(path) || !path.startsWith('/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const result: {
      exists: boolean;
      writable: boolean;
      freeSpace: string | null;
    } = { exists: false, writable: false, freeSpace: null };

    try {
      await runOnHost(['test', '-d', path], path);
      result.exists = true;
    } catch {
      return NextResponse.json(result);
    }

    const probe = `${path}/.mmc-verify-test`;
    try {
      // `sh -c '<script>' sh "$arg"` puts $arg in $1 inside the script — no
      // additional shell interpretation of its value.
      await runOnHost(['sh', '-c', 'touch "$1" && rm -f "$1"', 'sh', probe], path);
      result.writable = true;
    } catch {
      result.writable = false;
    }

    try {
      const dfOutput = await runOnHost(['df', '-h', path], path);
      const last = dfOutput.trim().split('\n').pop() || '';
      const parts = last.split(/\s+/);
      if (parts.length >= 4) {
        result.freeSpace = parts[3] || null;
      }
    } catch {
      // non-critical
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
