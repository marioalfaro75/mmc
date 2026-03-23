import { NextResponse } from 'next/server';
import { validateEnvVars, getAffectedServices, isMaskedValue } from '@/lib/env-schema';
import { requireAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const vars: Record<string, string> = body.vars;

    if (!vars || typeof vars !== 'object') {
      return NextResponse.json({ error: 'Missing vars object' }, { status: 400 });
    }

    // Filter out masked values
    const cleanVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      if (!isMaskedValue(value)) {
        cleanVars[key] = value;
      }
    }

    const errors = validateEnvVars(cleanVars);
    const affectedServices = getAffectedServices(Object.keys(cleanVars));

    return NextResponse.json({
      valid: Object.keys(errors).length === 0,
      errors,
      affectedServices,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Validation failed', details: String(err) },
      { status: 500 }
    );
  }
}
