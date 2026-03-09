import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

function getDeployLogDir(): string {
  // Deploy logs are stored in ~/.mmc/logs by the deploy script
  // Mounted into the container at the CONFIG_ROOT parent
  const home = process.env.HOME || '/tmp';
  const candidates = [
    '/app/logs',
    join(home, '.mmc', 'logs'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get('file');
    const dir = getDeployLogDir();

    if (file) {
      // Return contents of a specific deploy log
      const safeName = file.replace(/[^a-zA-Z0-9._-]/g, '');
      const filepath = join(dir, safeName);
      if (!existsSync(filepath)) {
        return NextResponse.json({ error: 'Log file not found' }, { status: 404 });
      }
      const content = readFileSync(filepath, 'utf-8');
      // Return last 2000 lines
      const lines = content.split('\n');
      const tail = lines.slice(-2000).join('\n');
      return NextResponse.json({ filename: safeName, content: tail });
    }

    // List deploy log files
    if (!existsSync(dir)) {
      return NextResponse.json({ files: [] });
    }

    const files = readdirSync(dir)
      .filter((f) => f.startsWith('deploy-') && f.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, 20)
      .map((f) => ({ name: f }));

    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read deploy logs', details: String(err) },
      { status: 500 }
    );
  }
}
