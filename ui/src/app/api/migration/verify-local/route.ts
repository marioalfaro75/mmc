import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

const execFileAsync = promisify(execFile);

async function runOnHost(cmd: string, bindPath: string, timeoutMs = 15000): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'run', '--rm',
    '-v', `${bindPath}:${bindPath}`,
    'alpine', 'sh', '-c', cmd,
  ], { timeout: timeoutMs });
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
    if (path.includes('..')) {
      return NextResponse.json({ error: 'Path traversal not allowed' }, { status: 400 });
    }
    if (!path.startsWith('/')) {
      return NextResponse.json({ error: 'Path must be absolute' }, { status: 400 });
    }

    const result: {
      exists: boolean;
      writable: boolean;
      freeSpace: string | null;
    } = { exists: false, writable: false, freeSpace: null };

    // Check if directory exists on the host
    try {
      await runOnHost(`test -d ${path} && echo yes`, path);
      result.exists = true;
    } catch {
      return NextResponse.json(result);
    }

    // Check writable
    try {
      await runOnHost(
        `touch ${path}/.mmc-verify-test && rm -f ${path}/.mmc-verify-test && echo ok`,
        path
      );
      result.writable = true;
    } catch {
      result.writable = false;
    }

    // Get free space
    try {
      const dfOutput = await runOnHost(`df -h ${path} | tail -1`, path);
      const parts = dfOutput.trim().split(/\s+/);
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
