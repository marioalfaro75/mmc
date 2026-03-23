import { NextResponse } from 'next/server';
import { readEnv, writeEnv } from '@/lib/env';
import { ENV_SCHEMA, maskSensitiveValues, isMaskedValue, validateEnvVars, getAffectedServices } from '@/lib/env-schema';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const vars = readEnv();
    return NextResponse.json({
      vars: maskSensitiveValues(vars),
      schema: ENV_SCHEMA,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read .env file', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const vars: Record<string, string> = body.vars;

    if (!vars || typeof vars !== 'object') {
      return NextResponse.json({ error: 'Missing vars object' }, { status: 400 });
    }

    // Filter out masked values (user didn't change them)
    const cleanVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      if (!isMaskedValue(value)) {
        cleanVars[key] = value;
      }
    }

    if (Object.keys(cleanVars).length === 0) {
      return NextResponse.json({ error: 'No changes to save' }, { status: 400 });
    }

    // Validate
    const errors = validateEnvVars(cleanVars);
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    // Write
    writeEnv(cleanVars);
    logger.info('settings', 'Environment variables updated', { keys: Object.keys(cleanVars) });

    const affectedServices = getAffectedServices(Object.keys(cleanVars));

    return NextResponse.json({
      updated: Object.keys(cleanVars),
      affectedServices,
      backupPath: 'created',
    });
  } catch (err) {
    logger.error('settings', 'Failed to update .env file', { error: String(err) });
    return NextResponse.json(
      { error: 'Failed to update .env file', details: sanitizeError(err) },
      { status: 500 }
    );
  }
}
