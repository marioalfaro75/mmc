import { NextResponse } from 'next/server';
import { getSettings, updateSettings } from '@/lib/api/bazarr';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/security';

export async function POST() {
  const bazarrKey = process.env.BAZARR_API_KEY;
  if (!bazarrKey) {
    return NextResponse.json(
      { error: 'Bazarr API key not configured — run Detect API Keys first' },
      { status: 400 }
    );
  }

  const sonarrKey = process.env.SONARR_API_KEY;
  const radarrKey = process.env.RADARR_API_KEY;

  if (!sonarrKey && !radarrKey) {
    return NextResponse.json(
      { error: 'Neither Sonarr nor Radarr API keys are configured — run Detect API Keys first' },
      { status: 400 }
    );
  }

  const results: { step: string; status: 'ok' | 'skipped' | 'error'; error?: string }[] = [];

  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    logger.error('bazarr-configure', `Failed to read Bazarr settings: ${err}`);
    return NextResponse.json(
      { error: sanitizeError(err) },
      { status: 502 }
    );
  }

  // Configure Sonarr connection
  if (sonarrKey) {
    try {
      if (settings.sonarr.apikey && settings.sonarr.ip !== '127.0.0.1') {
        results.push({ step: 'sonarr', status: 'skipped' });
      } else {
        await updateSettings({
          sonarr: { ...settings.sonarr, ip: 'sonarr', port: 8989, apikey: sonarrKey, ssl: false },
        });
        logger.info('bazarr-configure', 'Sonarr connection configured in Bazarr');
        results.push({ step: 'sonarr', status: 'ok' });
      }
    } catch (err) {
      logger.error('bazarr-configure', `Failed to configure Sonarr: ${err}`);
      results.push({ step: 'sonarr', status: 'error', error: sanitizeError(err) });
    }
  } else {
    results.push({ step: 'sonarr', status: 'skipped' });
  }

  // Configure Radarr connection
  if (radarrKey) {
    try {
      // Re-read settings in case the Sonarr update changed them
      const current = await getSettings();
      if (current.radarr.apikey && current.radarr.ip !== '127.0.0.1') {
        results.push({ step: 'radarr', status: 'skipped' });
      } else {
        await updateSettings({
          radarr: { ...current.radarr, ip: 'radarr', port: 7878, apikey: radarrKey, ssl: false },
        });
        logger.info('bazarr-configure', 'Radarr connection configured in Bazarr');
        results.push({ step: 'radarr', status: 'ok' });
      }
    } catch (err) {
      logger.error('bazarr-configure', `Failed to configure Radarr: ${err}`);
      results.push({ step: 'radarr', status: 'error', error: sanitizeError(err) });
    }
  } else {
    results.push({ step: 'radarr', status: 'skipped' });
  }

  const hasError = results.some((r) => r.status === 'error');
  return NextResponse.json({ success: !hasError, results }, { status: hasError ? 207 : 200 });
}
