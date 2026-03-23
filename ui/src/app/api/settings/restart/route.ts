import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { restartServicesStaged } from '@/lib/docker';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const projectDir = process.env.HOST_PROJECT_DIR;

  if (!projectDir) {
    return NextResponse.json(
      { error: 'HOST_PROJECT_DIR is not set' },
      { status: 500 }
    );
  }

  let services: string[] | undefined;
  try {
    const body = await request.json();
    services = body.services;
  } catch {
    // no body = restart all
  }

  if (services && services.length > 0) {
    // Selective staged restart
    try {
      await restartServicesStaged(services);
      return NextResponse.json({ status: 'restarted', services });
    } catch (err) {
      return NextResponse.json(
        { error: 'Selective restart failed', details: sanitizeError(err) },
        { status: 500 }
      );
    }
  }

  // Full stack restart (fire-and-forget since media-ui will recycle)
  const envFile = `${projectDir}/.env`;
  const composeFile = `${projectDir}/docker-compose.yml`;

  const args = [
    'compose',
    '-f', composeFile,
    '--project-directory', projectDir,
    '--env-file', envFile,
    'up', '-d', '--force-recreate',
  ];

  execFile('docker', args, (err) => {
    if (err) {
      console.error('Restart failed:', err.message);
    }
  });

  return NextResponse.json({ status: 'restarting' });
}
