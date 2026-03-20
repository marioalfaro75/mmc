import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeError } from '@/lib/security';

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();
    const dirPath = path || '/';

    if (typeof dirPath !== 'string' || dirPath.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // List directories at the given path on the host filesystem
    const { stdout } = await execFileAsync('docker', [
      'run', '--rm',
      '-v', '/:/host:ro',
      'alpine', 'sh', '-c',
      // List only directories, one per line, skip hidden dirs
      `ls -1 -p "/host${dirPath}" 2>/dev/null | grep '/$' | grep -v '^\\./' | sed 's|/$||' | sort | head -100`,
    ], { timeout: 10000 });

    const dirs = stdout.trim().split('\n').filter(Boolean);

    return NextResponse.json({ path: dirPath, dirs });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
