import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';
import { isValidPath } from '@/lib/shell-safe';

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { path } = await request.json();
    const dirPath = typeof path === 'string' && path.length > 0 ? path : '/';

    if (!isValidPath(dirPath) || !dirPath.startsWith('/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // List immediate subdirectories of /host<dirPath> on a fresh alpine
    // container with the host filesystem bind-mounted read-only. We pass the
    // target path as a `find` argv element — never through a shell — so it
    // can't break out of its argument position.
    const { stdout } = await execFileAsync(
      'docker',
      [
        'run', '--rm',
        '-v', '/:/host:ro',
        'alpine',
        'find', `/host${dirPath}`,
        '-mindepth', '1', '-maxdepth', '1',
        '-type', 'd',
        '-printf', '%f\n',
      ],
      { timeout: 10000 },
    );

    const dirs = stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('.'))
      .sort()
      .slice(0, 100);

    return NextResponse.json({ path: dirPath, dirs });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
