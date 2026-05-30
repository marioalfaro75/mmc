import { NextResponse } from 'next/server';
import { open, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const LOCK_PATH = '/app/logs/update.lock';
const LOG_TAIL_BYTES = 64 * 1024;

interface Lock {
  jobId: string;
  startedAt: string;
  containerLogPath: string;
  hostLogPath: string;
}

/**
 * Stateless status probe for an in-flight or recently-finished update.
 *
 *   running   true while update.lock exists (sidecar still going)
 *   logTail   last ~64 KB of the deploy log, or "" if not written yet
 *   logBytes  total size on disk, so a client can detect new content
 *
 * After a `docker compose up -d --build` recycles media-ui, the new
 * instance reads the same shared log file and serves identical status.
 */
export async function GET() {
  if (!existsSync(LOCK_PATH)) {
    return NextResponse.json({ running: false });
  }

  let lock: Lock;
  try {
    const raw = await readFile(LOCK_PATH, 'utf-8');
    if (!raw.trim()) {
      return NextResponse.json({ running: false });
    }
    lock = JSON.parse(raw) as Lock;
  } catch {
    return NextResponse.json({ running: false, error: 'Lock file unreadable' });
  }

  let logTail = '';
  let logBytes = 0;
  try {
    const st = await stat(lock.containerLogPath);
    logBytes = st.size;
    const start = Math.max(0, st.size - LOG_TAIL_BYTES);
    const length = st.size - start;
    if (length > 0) {
      const fd = await open(lock.containerLogPath, 'r');
      const buf = Buffer.alloc(length);
      await fd.read(buf, 0, length, start);
      await fd.close();
      logTail = buf.toString('utf-8');
    }
  } catch {
    // log not written yet — leave empty
  }

  return NextResponse.json({
    running: true,
    jobId: lock.jobId,
    startedAt: lock.startedAt,
    logBytes,
    logTail,
  });
}
