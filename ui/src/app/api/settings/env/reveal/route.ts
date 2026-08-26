import { NextResponse } from 'next/server';
import { readEnv } from '@/lib/env';
import { ENV_SCHEMA } from '@/lib/env-schema';
import { requireAdmin, getAdminSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Return the unmasked value of a single env var. Admin-only — the standard
 * /api/settings/env GET returns sensitive values masked to `••••••••` for
 * over-the-shoulder safety; this endpoint bypasses the mask when an admin
 * explicitly asks for one key.
 *
 * Restricted to keys in ENV_SCHEMA so this can't be turned into an
 * arbitrary .env slurper. Every reveal is logged with the admin's
 * username so the audit log can answer "who looked at what?".
 */
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'key parameter is required' }, { status: 400 });
  }

  const def = ENV_SCHEMA.find((d) => d.key === key);
  if (!def) {
    return NextResponse.json({ error: 'Unknown key' }, { status: 404 });
  }

  try {
    const env = readEnv();
    const value = env[key] ?? '';
    const session = getAdminSession(request);
    logger.info('settings', 'Env var revealed', {
      key,
      admin: session?.username ?? 'unknown',
    });
    return NextResponse.json({ key, value });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read .env', details: sanitizeError(err) },
      { status: 500 },
    );
  }
}
