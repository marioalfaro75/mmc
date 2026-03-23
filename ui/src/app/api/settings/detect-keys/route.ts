import { NextResponse } from 'next/server';
import { readApiKeysFromConfig } from '@/lib/config-keys';
import { readEnv, writeEnv } from '@/lib/env';
import { restartService, selfRestart } from '@/lib/docker';
import { logger } from '@/lib/logger';
import { requireAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const env = readEnv();
  const configRoot = env.CONFIG_ROOT || process.env.CONFIG_ROOT;

  if (!configRoot) {
    return NextResponse.json(
      { error: 'CONFIG_ROOT is not set — configure paths in Settings first' },
      { status: 400 }
    );
  }

  const { detected, missing } = readApiKeysFromConfig(configRoot);

  if (Object.keys(detected).length === 0) {
    return NextResponse.json(
      { error: 'No API keys found — make sure Sonarr, Radarr, and Prowlarr have been started at least once', missing },
      { status: 404 }
    );
  }

  // Also populate Unpackerr keys from Sonarr/Radarr keys
  const toWrite: Record<string, string> = { ...detected };
  if (detected.SONARR_API_KEY) toWrite.UN_SONARR_0_API_KEY = detected.SONARR_API_KEY;
  if (detected.RADARR_API_KEY) toWrite.UN_RADARR_0_API_KEY = detected.RADARR_API_KEY;

  writeEnv(toWrite);

  // Restart unpackerr to pick up new API keys
  const restarted: string[] = [];
  try {
    await restartService('unpackerr');
    restarted.push('unpackerr');
    logger.info('detect-keys', 'Restarted unpackerr with new API keys');
  } catch (err) {
    logger.warn('detect-keys', `Failed to restart unpackerr: ${err}`);
  }

  // Self-restart media-ui to pick up new env vars (fire-and-forget)
  selfRestart();
  restarted.push('media-ui');
  logger.info('detect-keys', 'Triggered media-ui self-restart to pick up new API keys');

  return NextResponse.json({ detected: Object.keys(toWrite), missing, restarted });
}
