import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';
import { isValidPath } from '@/lib/shell-safe';

const execFileAsync = promisify(execFile);

// Run a tool inside a short-lived alpine container with the user-supplied
// mount point bind-mounted. argv is passed as Docker arguments directly —
// nothing is ever fed to a shell, so user input can't escape its slot.
async function runOnHost(argv: string[], bindPath: string, timeoutMs = 15000): Promise<string> {
  const { stdout } = await execFileAsync(
    'docker',
    ['run', '--rm', '--net=host', '-v', `${bindPath}:${bindPath}`, 'alpine', ...argv],
    { timeout: timeoutMs },
  );
  return stdout;
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { mountPoint } = await request.json();

    if (!mountPoint || typeof mountPoint !== 'string') {
      return NextResponse.json({ success: false, error: 'Mount point is required' }, { status: 400 });
    }
    if (!isValidPath(mountPoint) || !mountPoint.startsWith('/')) {
      return NextResponse.json({ success: false, error: 'Invalid mount point' }, { status: 400 });
    }

    const result: {
      mounted: boolean;
      writable: boolean;
      freeSpace: string | null;
      totalSpace: string | null;
    } = {
      mounted: false,
      writable: false,
      freeSpace: null,
      totalSpace: null,
    };

    // Is it a mount? awk with -v passes the target as a script variable,
    // not as shell text — safe even if mountPoint contained metacharacters
    // (it can't, after isValidPath, but defense-in-depth). awk exits 0 if a
    // matching mount line was found, non-zero otherwise — runOnHost rejects
    // on non-zero so we use try/catch to read the result.
    try {
      await runOnHost(
        ['awk', '-v', `t=${mountPoint}`, '$2 == t { found=1 } END { exit !found }', '/proc/mounts'],
        mountPoint,
      );
      result.mounted = true;
    } catch {
      result.mounted = false;
    }

    if (!result.mounted) {
      return NextResponse.json({ success: true, ...result });
    }

    // Can we write? touch + rm a probe file inside the mount.
    const probe = `${mountPoint}/.mmc-mount-test`;
    try {
      await runOnHost(['sh', '-c', 'touch "$1" && rm -f "$1"', 'sh', probe], mountPoint);
      result.writable = true;
    } catch {
      result.writable = false;
    }

    // Disk space: df with the mount point as a positional argv argument.
    try {
      const dfOutput = await runOnHost(['df', '-h', mountPoint], mountPoint);
      const last = dfOutput.trim().split('\n').pop() || '';
      const parts = last.split(/\s+/);
      if (parts.length >= 4) {
        result.totalSpace = parts[1] || null;
        result.freeSpace = parts[3] || null;
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}
