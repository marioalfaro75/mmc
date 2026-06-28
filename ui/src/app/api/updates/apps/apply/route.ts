import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { requireAdmin } from '@/lib/auth';
import { sanitizeError } from '@/lib/security';
import { readEnv, writeEnv } from '@/lib/env';
import { APP_UPDATE_SOURCES, parseImageRef } from '@/lib/app-updates';
import { ENV_SCHEMA } from '@/lib/env-schema';

export const dynamic = 'force-dynamic';

const LOCK_PATH = '/app/logs/update.lock';
const LOCK_STALE_MS = 30 * 60 * 1000;

// Image tags allow [A-Za-z0-9_.-] up to 128 chars per OCI spec; no slashes.
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/**
 * Bump one IMAGE_* pin in .env and recreate the affected container.
 *
 * Unlike /api/updates/apply (which rebuilds media-ui and so must run in a
 * sidecar to survive its own restart), this one targets sibling containers
 * — but we still spawn a detached sidecar so:
 *  - the route returns immediately with a jobId,
 *  - progress logs to the same shared file /api/updates/status reads,
 *  - the in-flight lock keeps the existing "single update at a time" rule.
 *
 * The pull-then-write-then-up order means a broken tag (typo, removed
 * image) fails at `docker pull` before .env is touched.
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
    return NextResponse.json(
      { error: 'MMC_HOST_LOGS_DIR is not set (redeploy media-ui to pick it up)' },
      { status: 500 },
    );
  }

  let body: { key?: string; tag?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { key, tag } = body;
  if (!key || typeof key !== 'string' || !tag || typeof tag !== 'string') {
    return NextResponse.json({ error: 'Body must be {key, tag}' }, { status: 400 });
  }
  if (!APP_UPDATE_SOURCES[key]) {
    return NextResponse.json({ error: `Unknown image key: ${key}` }, { status: 400 });
  }
  if (!TAG_RE.test(tag)) {
    return NextResponse.json({ error: `Tag rejected: ${tag}` }, { status: 400 });
  }

  const def = ENV_SCHEMA.find((d) => d.key === key);
  const service = def?.affectsServices[0];
  if (!service) {
    return NextResponse.json({ error: `No service mapped for ${key}` }, { status: 500 });
  }

  const env = readEnv();
  const currentValue = env[key] || def?.default || '';
  if (!currentValue) {
    return NextResponse.json({ error: `${key} has no current value` }, { status: 500 });
  }
  const { image, tag: currentTag } = parseImageRef(currentValue);
  const newValue = `${image}:${tag}`;
  if (currentTag === tag) {
    return NextResponse.json({ error: `${key} is already on ${tag}` }, { status: 400 });
  }

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
      /* fall through and overwrite */
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logFileName = `app-update-${service}-${ts}.log`;
  const containerLogPath = `/app/logs/${logFileName}`;
  const hostLogPath = `${hostLogsDir}/${logFileName}`;
  const hostLockPath = `${hostLogsDir}/update.lock`;

  await writeFile(
    LOCK_PATH,
    JSON.stringify(
      { jobId: ts, startedAt: new Date().toISOString(), containerLogPath, hostLogPath },
      null,
      2,
    ),
  );

  // Write .env BEFORE the sidecar runs so `docker compose up -d` reads the
  // new IMAGE_* value when it interpolates the compose file. The earlier
  // `docker pull` in the sidecar fails fast on a bad tag, but the .env is
  // already moved at that point — so on failure we rewrite the old value
  // from the sidecar (since the sidecar owns the rollback path).
  try {
    writeEnv({ [key]: newValue });
  } catch (err) {
    try { await writeFile(LOCK_PATH, ''); } catch { /* ignore */ }
    return NextResponse.json(
      { error: 'Failed to write .env', details: sanitizeError(err) },
      { status: 500 },
    );
  }

  // Inner script:
  //   1. Pull the new image. If pull fails, restore the .env pin.
  //   2. Recreate the service via `docker compose up -d --no-deps <service>`.
  //   3. Drop the lock either way.
  // Compose is invoked with --env-file so the host .env is honored (the
  // sidecar's cwd is HOST_PROJECT_DIR but compose's default .env discovery
  // already covers that — being explicit is just safety against future cwd
  // changes).
  //
  // The shell-quoting here is safe because `tag` passed TAG_RE, `key` came
  // from APP_UPDATE_SOURCES (constant keys), and `service` came from
  // ENV_SCHEMA (constant strings). `image`, `currentValue`, `newValue` are
  // built from those same trusted inputs.
  const sidecarName = `mmc-app-updater-${service}-${ts}`;
  const innerCmd =
    `set -e; ` +
    `echo "[$(date -u +%FT%TZ)] Pulling ${newValue}" >> ${hostLogPath}; ` +
    `if ! docker pull ${newValue} >> ${hostLogPath} 2>&1; then ` +
    `  echo "[$(date -u +%FT%TZ)] Pull failed — rolling back .env to ${currentValue}" >> ${hostLogPath}; ` +
    `  sed -i 's|^${key}=.*|${key}=${currentValue}|' ${projectDir}/.env >> ${hostLogPath} 2>&1; ` +
    `  rm -f ${hostLockPath}; ` +
    `  exit 1; ` +
    `fi; ` +
    `echo "[$(date -u +%FT%TZ)] Recreating ${service}" >> ${hostLogPath}; ` +
    `docker compose --env-file ${projectDir}/.env -f ${projectDir}/docker-compose.yml up -d --no-deps ${service} >> ${hostLogPath} 2>&1; ` +
    `rc=$?; ` +
    `echo "[$(date -u +%FT%TZ)] Done (exit $rc)" >> ${hostLogPath}; ` +
    `rm -f ${hostLockPath}; ` +
    `exit $rc`;

  const args = [
    'run',
    '--rm', '-d',
    '--name', sidecarName,
    '-v', '/var/run/docker.sock:/var/run/docker.sock',
    '-v', `${projectDir}:${projectDir}`,
    '-v', `${hostLogsDir}:${hostLogsDir}`,
    '-w', projectDir,
    '--entrypoint', 'sh',
    'mmc-media-ui:latest',
    '-c', innerCmd,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile('docker', args, (err, _stdout, stderr) => {
        if (err) {
          console.error('App-updater sidecar failed to start:', err.message, stderr);
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    // Sidecar didn't start — roll back .env and clear the lock.
    try { writeEnv({ [key]: currentValue }); } catch { /* ignore */ }
    try { await writeFile(LOCK_PATH, ''); } catch { /* ignore */ }
    return NextResponse.json(
      { error: 'Failed to start app-updater sidecar', details: sanitizeError(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: 'started',
    jobId: ts,
    sidecarName,
    service,
    key,
    newValue,
    logPath: containerLogPath,
  });
}
