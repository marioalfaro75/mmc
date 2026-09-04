import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync } from 'fs';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { writeEnv } from '@/lib/env';
import { recreateServices } from '@/lib/docker';
import {
  OVERRIDE_FILENAME,
  MOUNT_PATH,
  NAS_MOUNTED_SERVICES,
  generateOverrideYaml,
} from '@/lib/nas-override';

const LOG = 'migration';
const PROJECT_DIR = process.env.HOST_PROJECT_DIR || '';

interface SetupRequest {
  protocol: 'smb' | 'nfs';
  host: string;
  sharePath: string;
  smbUser?: string;
  smbPassword?: string;
  vers?: string;
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  if (!PROJECT_DIR) {
    return NextResponse.json({ success: false, error: 'HOST_PROJECT_DIR is not set' }, { status: 500 });
  }

  try {
    const body = (await request.json()) as SetupRequest;
    const { protocol, host, sharePath, smbUser, smbPassword, vers } = body;

    // Validation
    if (!protocol || !host || !sharePath) {
      return NextResponse.json({ success: false, error: 'protocol, host, and sharePath are required' }, { status: 400 });
    }
    if (!['smb', 'nfs'].includes(protocol)) {
      return NextResponse.json({ success: false, error: 'protocol must be smb or nfs' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(host)) {
      return NextResponse.json({ success: false, error: 'Invalid host format' }, { status: 400 });
    }
    if (sharePath.includes('..') || !/^[a-zA-Z0-9/._ -]+$/.test(sharePath)) {
      return NextResponse.json({ success: false, error: 'Invalid share path' }, { status: 400 });
    }
    if (protocol === 'smb' && !smbUser) {
      return NextResponse.json({ success: false, error: 'SMB requires a username' }, { status: 400 });
    }

    logger.info(LOG, `Setting up NAS volume: ${protocol}://${host}${sharePath}`);

    // Step 1: Write NAS_* values to .env (writeEnv handles backup + atomic write)
    const envUpdates: Record<string, string> = {
      NAS_HOST: host,
      NAS_SHARE: sharePath.replace(/^\/+/, ''),
      NAS_VERS: vers || '3.0',
    };
    if (protocol === 'smb') {
      envUpdates.NAS_USERNAME = smbUser || '';
      envUpdates.NAS_PASSWORD = smbPassword || '';
    }
    writeEnv(envUpdates);
    logger.info(LOG, 'Wrote NAS credentials to .env');

    // Step 2: Generate the override file in the project root
    const overridePath = `${PROJECT_DIR}/${OVERRIDE_FILENAME}`;
    const overrideContent = generateOverrideYaml(protocol);
    writeFileSync(overridePath, overrideContent, { mode: 0o644 });
    logger.info(LOG, `Wrote override file: ${overridePath}`);

    // Step 3: Recreate the services that mount the volume. media-ui is not
    // among them — see lib/nas-override for why — so this call returns
    // cleanly without killing the current request.
    // composeArgs() now picks up the override file automatically because we just wrote it.
    const svcList = NAS_MOUNTED_SERVICES.join(', ');
    try {
      await recreateServices([...NAS_MOUNTED_SERVICES]);
      logger.info(LOG, `Recreated ${svcList} with the new volume mount`);
    } catch (err) {
      const msg = sanitizeError(err);
      logger.error(LOG, `Failed to recreate services: ${msg}`);
      return NextResponse.json({
        success: false,
        error: `Volume configured but service recreation failed: ${msg}. The override file was written; you can recover with: docker compose up -d --force-recreate ${NAS_MOUNTED_SERVICES.join(' ')}`,
      }, { status: 500 });
    }

    // No media-ui restart. It doesn't mount the volume, so there is nothing
    // for it to pick up — and keeping the dashboard alive through this
    // operation means you can still see the result.
    return NextResponse.json({
      success: true,
      overridePath: `${PROJECT_DIR}/${OVERRIDE_FILENAME}`,
      mountPath: MOUNT_PATH,
      message: `NAS volume configured. ${svcList} have been recreated. The dashboard is unaffected — it reaches host data via the DATA_ROOT bind-mount, so a NAS outage can no longer take it offline.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}

// Allow checking whether the override file is currently active
export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  if (!PROJECT_DIR) {
    return NextResponse.json({ active: false, error: 'HOST_PROJECT_DIR is not set' });
  }

  const overridePath = `${PROJECT_DIR}/${OVERRIDE_FILENAME}`;
  return NextResponse.json({
    active: existsSync(overridePath),
    overridePath,
    mountPath: MOUNT_PATH,
  });
}
