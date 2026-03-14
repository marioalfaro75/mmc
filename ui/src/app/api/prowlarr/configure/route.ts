import { NextResponse } from 'next/server';
import { getApplications, addApplication } from '@/lib/api/prowlarr';

export async function POST() {
  const results: { step: string; status: 'ok' | 'skipped' | 'error'; error?: string }[] = [];

  const sonarrKey = process.env.SONARR_API_KEY;
  const radarrKey = process.env.RADARR_API_KEY;

  if (!sonarrKey && !radarrKey) {
    return NextResponse.json(
      { success: false, error: 'No API keys found — run Auto-detect API Keys first, then restart the stack' },
      { status: 400 }
    );
  }

  let existingApps: { id: number; name: string; implementation: string }[] = [];
  try {
    existingApps = await getApplications();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Cannot reach Prowlarr — ${String(error)}` },
      { status: 500 }
    );
  }

  // Add Sonarr
  if (sonarrKey) {
    try {
      if (existingApps.some((a) => a.implementation === 'Sonarr')) {
        results.push({ step: 'sonarr-app', status: 'skipped' });
      } else {
        await addApplication({
          name: 'Sonarr',
          implementation: 'Sonarr',
          configContract: 'SonarrSettings',
          syncLevel: 'fullSync',
          fields: [
            { name: 'prowlarrUrl', value: 'http://prowlarr:9696' },
            { name: 'baseUrl', value: 'http://sonarr:8989' },
            { name: 'apiKey', value: sonarrKey },
          ],
        });
        results.push({ step: 'sonarr-app', status: 'ok' });
      }
    } catch (error) {
      results.push({ step: 'sonarr-app', status: 'error', error: String(error) });
    }
  } else {
    results.push({ step: 'sonarr-app', status: 'skipped' });
  }

  // Add Radarr
  if (radarrKey) {
    try {
      if (existingApps.some((a) => a.implementation === 'Radarr')) {
        results.push({ step: 'radarr-app', status: 'skipped' });
      } else {
        await addApplication({
          name: 'Radarr',
          implementation: 'Radarr',
          configContract: 'RadarrSettings',
          syncLevel: 'fullSync',
          fields: [
            { name: 'prowlarrUrl', value: 'http://prowlarr:9696' },
            { name: 'baseUrl', value: 'http://radarr:7878' },
            { name: 'apiKey', value: radarrKey },
          ],
        });
        results.push({ step: 'radarr-app', status: 'ok' });
      }
    } catch (error) {
      results.push({ step: 'radarr-app', status: 'error', error: String(error) });
    }
  } else {
    results.push({ step: 'radarr-app', status: 'skipped' });
  }

  const hasError = results.some((r) => r.status === 'error');
  return NextResponse.json({ success: !hasError, results }, { status: hasError ? 207 : 200 });
}
