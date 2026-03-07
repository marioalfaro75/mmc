import { NextResponse } from 'next/server';
import { exec } from 'child_process';

export async function POST() {
  const projectDir = process.env.HOST_PROJECT_DIR;

  if (!projectDir) {
    return NextResponse.json(
      { error: 'HOST_PROJECT_DIR is not set' },
      { status: 500 }
    );
  }

  const envFile = `${projectDir}/.env`;
  const composeFile = `${projectDir}/docker-compose.yml`;

  const cmd = [
    'docker compose',
    `-f ${composeFile}`,
    `--project-directory ${projectDir}`,
    `--env-file ${envFile}`,
    'up -d --force-recreate',
  ].join(' ');

  // Fire-and-forget: respond before the container recycles
  exec(cmd, (err) => {
    if (err) {
      console.error('Restart failed:', err.message);
    }
  });

  return NextResponse.json({ status: 'restarting', command: cmd });
}
