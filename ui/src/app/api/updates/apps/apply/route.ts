import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeError } from '@/lib/security';
import { readEnv, writeEnv } from '@/lib/env';
import { pullImage, recreateServices } from '@/lib/docker';
import { APP_UPDATE_SOURCES, parseImageRef } from '@/lib/app-updates';
import { ENV_SCHEMA } from '@/lib/env-schema';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LOG = 'updates';
// OCI tag grammar: [A-Za-z0-9_][A-Za-z0-9._-]{0,127}
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/**
 * Bump one IMAGE_* pin in .env and recreate that container.
 *
 * Runs inline rather than in a sidecar. The sidecar only ever existed
 * because media-ui cannot recreate *itself* — but these are sibling
 * containers, so the docker socket we already hold is enough. That removes
 * the lock file, the log tailing and the status polling that went with it.
 *
 * Pull first, write .env second, recreate third. A bad tag then fails at the
 * pull, before anything on disk or any running container has been touched —
 * the previous ordering wrote .env first and had to sed it back on failure.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

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

  // This route recreates a *sibling* container. Pointing it at media-ui kills
  // the process serving the request, so the response never arrives and the
  // browser shows "Failed to fetch" — with .env possibly already written and
  // the error path that would restore it never reached.
  //
  // Updating ourselves needs the detached helper in /api/updates/apply, which
  // survives our replacement precisely because it is a separate container.
  if (service === 'media-ui') {
    return NextResponse.json(
      {
        error:
          'The dashboard cannot update itself through this endpoint — it would ' +
          'kill the process mid-request. Use POST /api/updates/apply instead.',
      },
      { status: 400 },
    );
  }

  const env = readEnv();
  const currentValue = env[key] || def?.default || '';
  if (!currentValue) {
    return NextResponse.json({ error: `${key} has no current value` }, { status: 500 });
  }
  const { image, tag: currentTag } = parseImageRef(currentValue);
  if (currentTag === tag) {
    return NextResponse.json({ error: `${key} is already on ${tag}` }, { status: 400 });
  }
  const newValue = `${image}:${tag}`;

  try {
    await pullImage(newValue);
  } catch (err) {
    logger.warn(LOG, `Pull failed for ${newValue}: ${String(err)}`);
    return NextResponse.json(
      {
        error: `Could not pull ${newValue} — is that tag published?`,
        details: sanitizeError(err),
      },
      { status: 502 },
    );
  }

  try {
    writeEnv({ [key]: newValue });
    await recreateServices([service]);
    logger.info(LOG, `Updated ${service}: ${currentTag} -> ${tag}`);
    return NextResponse.json({
      status: 'updated',
      key,
      service,
      previousTag: currentTag,
      tag,
      image: newValue,
    });
  } catch (err) {
    // The image pulled fine, so this is a compose/runtime problem. Put the
    // pin back so .env keeps describing what is actually running.
    try {
      writeEnv({ [key]: currentValue });
    } catch {
      /* best effort */
    }
    logger.error(LOG, `Recreate failed for ${service}: ${String(err)}`);
    return NextResponse.json(
      {
        error: `${service} failed to restart on ${tag} — rolled back to ${currentTag}`,
        details: sanitizeError(err),
      },
      { status: 500 },
    );
  }
}
