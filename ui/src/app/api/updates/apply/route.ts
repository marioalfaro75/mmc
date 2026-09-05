import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeError } from '@/lib/security';
import { readEnv, writeEnv } from '@/lib/env';
import { selfRestart } from '@/lib/docker';
import { parseImageRef } from '@/lib/app-updates';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LOG = 'updates';
// OCI tag grammar: [A-Za-z0-9_][A-Za-z0-9._-]{0,127}
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/**
 * Update the dashboard itself.
 *
 * This used to spawn a sidecar that ran `deploy.sh --update`, which did a
 * `git pull` and then rebuilt the Next.js app on the host — stopping the
 * running container first. An OOM or a registry hiccup at that point left no
 * dashboard and no image to fall back to, and the script exited 0 regardless,
 * so the UI reported success either way.
 *
 * The image is now built by CI and published to GHCR, so updating is: write
 * the new tag to .env, then pull and recreate. If the pull fails, the running
 * container is untouched. Rolling back is the same operation with an older
 * tag.
 *
 * Optional body: { tag } to move to a specific version. Without it, this
 * re-pulls the currently pinned tag — which is what you want when `:latest`
 * has advanced after a release.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let tag: string | undefined;
  try {
    const body = (await request.json()) as { tag?: string };
    tag = body?.tag;
  } catch {
    // No body is fine — means "re-pull the current tag".
  }

  try {
    const env = readEnv();
    const current = env.IMAGE_MEDIA_UI || 'ghcr.io/marioalfaro75/mmc-media-ui:latest';
    const { image, tag: currentTag } = parseImageRef(current);

    let target = current;
    if (tag) {
      if (!TAG_RE.test(tag)) {
        return NextResponse.json({ error: `Tag rejected: ${tag}` }, { status: 400 });
      }
      target = `${image}:${tag}`;
      if (target !== current) {
        writeEnv({ IMAGE_MEDIA_UI: target });
        logger.info(LOG, `Pinned dashboard image ${currentTag} -> ${tag}`);
      }
    }

    // Fire-and-forget: the helper container recreates us, so this process is
    // about to be replaced. The response goes out first; the client polls
    // /api/health until the new instance answers.
    selfRestart(true);
    logger.info(LOG, `Dashboard update started (${target})`);

    return NextResponse.json({
      status: 'started',
      image: target,
      previousTag: currentTag,
      message:
        'Pulling and recreating the dashboard. This page will reconnect in a few seconds.',
    });
  } catch (err) {
    logger.error(LOG, `Dashboard update failed to start: ${String(err)}`);
    return NextResponse.json(
      { error: 'Failed to start the update', details: sanitizeError(err) },
      { status: 500 },
    );
  }
}
