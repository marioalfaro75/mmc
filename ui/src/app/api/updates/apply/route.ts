import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { requireAdmin } from '@/lib/auth';
import { sanitizeError } from '@/lib/security';

export const dynamic = 'force-dynamic';

const LOCK_PATH = '/app/logs/update.lock';
const LOCK_STALE_MS = 30 * 60 * 1000; // 30 min

/**
 * Kick off ./scripts/deploy.sh --update inside a detached sidecar container.
 *
 * The sidecar is necessary because deploy.sh's `docker compose up -d --build`
 * will recreate the media-ui container — which is where this API route lives.
 * If we spawned the script inside media-ui, our process would die mid-build.
 * The sidecar uses the same mmc-media-ui:latest image (already on disk, has
 * docker-cli + git) but runs in its own container so it survives our restart.
 *
 * Returns immediately with a job ID. Clients poll /api/updates/status to
 * watch progress; once media-ui has recycled, the polling resumes against
 * the new instance, which reads the same shared log file.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const projectDir = process.env.HOST_PROJECT_DIR;
  const hostLogsDir = process.env.MMC_HOST_LOGS_DIR;
  if (!projectDir) {
    return NextResponse.json({ error: 'HOST_PROJECT_DIR is not set' }, { status: 500 });
  }
  if (!hostLogsDir) {
    return NextResponse.json({ error: 'MMC_HOST_LOGS_DIR is not set (redeploy media-ui to pick it up)' }, { status: 500 });
  }

  // Refuse if a previous update is still in flight (unless it's stale).
  if (existsSync(LOCK_PATH)) {
    try {
      const st = await stat(LOCK_PATH);
      if (Date.now() - st.mtimeMs < LOCK_STALE_MS) {
        return NextResponse.json(
          { error: 'An update is already in progress. Use /api/updates/status to follow it.' },
          { status: 409 },
        );
      }
    } catch {
      // fall through — we'll overwrite the lock
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logFileName = `update-${ts}.log`;
  const containerLogPath = `/app/logs/${logFileName}`;
  const hostLogPath = `${hostLogsDir}/${logFileName}`;
  const hostLockPath = `${hostLogsDir}/update.lock`;

  const lock = {
    jobId: ts,
    startedAt: new Date().toISOString(),
    containerLogPath,
    hostLogPath,
  };
  await writeFile(LOCK_PATH, JSON.stringify(lock, null, 2));

  // The sidecar reuses mmc-media-ui:latest (already on disk, has docker-cli,
  // git, bash from the recently-updated Dockerfile). When deploy.sh recreates
  // media-ui, the sidecar is unaffected — different container.
  //
  // We pre-trust the project dir before invoking deploy.sh so the script's
  // own `git pull` doesn't trip the "dubious ownership" guard (the host
  // repo is owned by PUID, the sidecar runs as root).
  //
  // After the update we chown .git back to PUID:PGID — the sidecar runs as
  // root, so git pull lands new pack files in .git/objects owned by root.
  // Without this fixup, `rm -rf ~/mmc` from the user later fails on those
  // files, and the user-side `git pull` we suggest after install starts
  // hitting permission errors too.
  const sidecarName = `mmc-updater-${ts}`;
  const puid = process.env.PUID || '1000';
  const pgid = process.env.PGID || '1000';
  const innerCmd =
    `git config --global --add safe.directory ${projectDir} && ` +
    `./scripts/deploy.sh --update >> ${hostLogPath} 2>&1; rc=$?; ` +
    `chown -R ${puid}:${pgid} ${projectDir}/.git >> ${hostLogPath} 2>&1 || true; ` +
    `rm -f ${hostLockPath}; exit $rc`;

  const args = [
    'run',
    '--rm', '-d',
    '--name', sidecarName,
    // host.docker.internal → host gateway so deploy.sh's wait_for_port
    // probes (curl http://$MMC_PORT_CHECK_HOST:PORT) actually reach the
    // ports the project publishes on the host. Without this they'd
    // probe the sidecar's own loopback and every port check would fail.
    '--add-host', 'host.docker.internal:host-gateway',
    '-v', '/var/run/docker.sock:/var/run/docker.sock',
    '-v', `${projectDir}:${projectDir}`,
    '-v', `${hostLogsDir}:${hostLogsDir}`,
    '-w', projectDir,
    '-e', `HOST_PROJECT_DIR=${projectDir}`,
    '-e', 'MMC_PORT_CHECK_HOST=host.docker.internal',
    '--entrypoint', 'sh',
    'mmc-media-ui:latest',
    '-c', innerCmd,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile('docker', args, (err, _stdout, stderr) => {
        if (err) {
          console.error('Updater sidecar failed to start:', err.message, stderr);
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    // Failed to start — clear our lock so the next attempt isn't blocked.
    try {
      await writeFile(LOCK_PATH, '');
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: 'Failed to start updater sidecar', details: sanitizeError(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: 'started',
    jobId: ts,
    sidecarName,
    logPath: containerLogPath,
  });
}
