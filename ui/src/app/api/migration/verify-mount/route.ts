import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeError } from '@/lib/security';

const execFileAsync = promisify(execFile);

// Run a command on the host via a temporary Docker container.
// The media-ui container cannot see host mounts, so we spawn a
// short-lived container with the mount point bind-mounted in.
async function runOnHost(cmd: string, mountPoint: string, timeoutMs = 15000): Promise<string> {
  const { stdout } = await execFileAsync('docker', [
    'run', '--rm', '--net=host',
    '-v', `${mountPoint}:${mountPoint}`,
    'alpine', 'sh', '-c', cmd,
  ], { timeout: timeoutMs });
  return stdout;
}

export async function POST(request: NextRequest) {
  try {
    const { mountPoint } = await request.json();

    if (!mountPoint || typeof mountPoint !== 'string') {
      return NextResponse.json({ success: false, error: 'Mount point is required' }, { status: 400 });
    }

    // Validate no path traversal
    if (mountPoint.includes('..')) {
      return NextResponse.json({ success: false, error: 'Path traversal not allowed' }, { status: 400 });
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

    // Check if mounted on the host by inspecting /proc/mounts
    try {
      const mounts = await runOnHost(`cat /proc/mounts | grep ' ${mountPoint} '`, mountPoint);
      result.mounted = mounts.trim().length > 0;
    } catch {
      // grep returns exit 1 if no match — not mounted
      result.mounted = false;
    }

    if (!result.mounted) {
      return NextResponse.json({ success: true, ...result });
    }

    // Check if writable
    try {
      await runOnHost(
        `touch ${mountPoint}/.mmc-mount-test && rm -f ${mountPoint}/.mmc-mount-test && echo ok`,
        mountPoint
      );
      result.writable = true;
    } catch {
      result.writable = false;
    }

    // Get disk space
    try {
      const dfOutput = await runOnHost(`df -h ${mountPoint} | tail -1`, mountPoint);
      const parts = dfOutput.trim().split(/\s+/);
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
