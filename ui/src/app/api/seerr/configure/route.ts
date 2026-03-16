import { NextResponse } from 'next/server';
import {
  getSonarrSettings,
  getRadarrSettings,
  testSonarrConnection,
  testRadarrConnection,
  addSonarrServer,
  addRadarrServer,
} from '@/lib/api/seerr';
import { sanitizeError } from '@/lib/security';
import { logger } from '@/lib/logger';

export async function POST() {
  const sonarrUrl = process.env.SONARR_URL || 'http://sonarr:8989';
  const sonarrKey = process.env.SONARR_API_KEY || '';
  const radarrUrl = process.env.RADARR_URL || 'http://radarr:7878';
  const radarrKey = process.env.RADARR_API_KEY || '';
  const seerrKey = process.env.SEERR_API_KEY || '';

  if (!seerrKey) {
    return NextResponse.json(
      { error: 'Seerr API key not configured' },
      { status: 400 }
    );
  }

  const results: { service: string; status: string; error?: string }[] = [];

  // Configure Radarr in Seerr
  if (radarrKey) {
    try {
      // Check if already configured
      const existing = await getRadarrSettings();
      if (existing.length > 0) {
        results.push({ service: 'radarr', status: 'already_configured' });
      } else {
        // Parse hostname and port from URL
        const radarrParsed = new URL(radarrUrl);
        const hostname = radarrParsed.hostname;
        const port = parseInt(radarrParsed.port) || 7878;

        // Test connection to get profiles and root folders
        const test = await testRadarrConnection(hostname, port, radarrKey);

        if (!test.profiles?.length || !test.rootFolders?.length) {
          results.push({ service: 'radarr', status: 'error', error: 'No profiles or root folders found in Radarr' });
        } else {
          await addRadarrServer({
            name: 'Radarr',
            hostname,
            port,
            apiKey: radarrKey,
            activeProfileId: test.profiles[0].id,
            rootFolder: test.rootFolders[0].path,
            isDefault: true,
          });
          logger.info('seerr-configure', `Radarr configured in Seerr (profile: ${test.profiles[0].name}, root: ${test.rootFolders[0].path})`);
          results.push({ service: 'radarr', status: 'configured' });
        }
      }
    } catch (err) {
      logger.error('seerr-configure', `Failed to configure Radarr in Seerr: ${err}`);
      results.push({ service: 'radarr', status: 'error', error: sanitizeError(err) });
    }
  } else {
    results.push({ service: 'radarr', status: 'skipped', error: 'Radarr API key not set' });
  }

  // Configure Sonarr in Seerr
  if (sonarrKey) {
    try {
      const existing = await getSonarrSettings();
      if (existing.length > 0) {
        results.push({ service: 'sonarr', status: 'already_configured' });
      } else {
        const sonarrParsed = new URL(sonarrUrl);
        const hostname = sonarrParsed.hostname;
        const port = parseInt(sonarrParsed.port) || 8989;

        const test = await testSonarrConnection(hostname, port, sonarrKey);

        if (!test.profiles?.length || !test.rootFolders?.length) {
          results.push({ service: 'sonarr', status: 'error', error: 'No profiles or root folders found in Sonarr' });
        } else {
          await addSonarrServer({
            name: 'Sonarr',
            hostname,
            port,
            apiKey: sonarrKey,
            activeProfileId: test.profiles[0].id,
            rootFolder: test.rootFolders[0].path,
            activeLanguageProfileId: 1,
            isDefault: true,
          });
          logger.info('seerr-configure', `Sonarr configured in Seerr (profile: ${test.profiles[0].name}, root: ${test.rootFolders[0].path})`);
          results.push({ service: 'sonarr', status: 'configured' });
        }
      }
    } catch (err) {
      logger.error('seerr-configure', `Failed to configure Sonarr in Seerr: ${err}`);
      results.push({ service: 'sonarr', status: 'error', error: sanitizeError(err) });
    }
  } else {
    results.push({ service: 'sonarr', status: 'skipped', error: 'Sonarr API key not set' });
  }

  const allOk = results.every(r => r.status === 'configured' || r.status === 'already_configured');
  return NextResponse.json({ results }, { status: allOk ? 200 : 207 });
}
