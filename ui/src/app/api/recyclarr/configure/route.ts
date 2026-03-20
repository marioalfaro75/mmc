import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync } from 'fs';
import { sanitizeError } from '@/lib/security';
import { readEnv } from '@/lib/env';

const execFileAsync = promisify(execFile);

export async function POST() {
  const results: { step: string; status: string; error?: string }[] = [];

  try {
    const vars = readEnv();
    const sonarrKey = vars.SONARR_API_KEY || process.env.SONARR_API_KEY || '';
    const radarrKey = vars.RADARR_API_KEY || process.env.RADARR_API_KEY || '';

    if (!sonarrKey && !radarrKey) {
      return NextResponse.json({
        success: false,
        error: 'No Sonarr or Radarr API keys found. Run Detect API Keys first.',
      }, { status: 400 });
    }

    const configRoot = vars.CONFIG_ROOT || `${process.env.HOME}/.mmc/config`;
    const resolvePath = (p: string) => p.startsWith('~') ? `${process.env.HOME}${p.slice(1)}` : p;
    const configDir = `${resolvePath(configRoot)}/recyclarr/configs`;

    // Step 1: Generate Sonarr template
    if (sonarrKey) {
      try {
        // Use recyclarr CLI to create the template
        await execFileAsync('docker', [
          'exec', 'recyclarr', 'recyclarr', 'config', 'create', '-t', 'web-1080p',
        ], { timeout: 30000 });

        // Patch in real values
        const sonarrConfigPath = `${configDir}/web-1080p.yml`;
        let content = readFileSync(sonarrConfigPath, 'utf-8');
        content = content.replace('Put your Sonarr URL here', 'http://sonarr:8989');
        content = content.replace('Put your API key here', sonarrKey);
        writeFileSync(sonarrConfigPath, content);

        results.push({ step: 'Sonarr (WEB-1080p)', status: 'configured' });
      } catch (err) {
        results.push({ step: 'Sonarr config', status: 'error', error: sanitizeError(err) });
      }
    }

    // Step 2: Generate Radarr template
    if (radarrKey) {
      try {
        await execFileAsync('docker', [
          'exec', 'recyclarr', 'recyclarr', 'config', 'create', '-t', 'remux-web-1080p',
        ], { timeout: 30000 });

        const radarrConfigPath = `${configDir}/remux-web-1080p.yml`;
        let content = readFileSync(radarrConfigPath, 'utf-8');
        content = content.replace('Put your Radarr URL here', 'http://radarr:7878');
        content = content.replace('Put your API key here', radarrKey);
        writeFileSync(radarrConfigPath, content);

        results.push({ step: 'Radarr (Remux + WEB 1080p)', status: 'configured' });
      } catch (err) {
        results.push({ step: 'Radarr config', status: 'error', error: sanitizeError(err) });
      }
    }

    // Step 3: Run initial sync
    try {
      await execFileAsync('docker', [
        'exec', 'recyclarr', 'recyclarr', 'sync',
      ], { timeout: 120000 });
      results.push({ step: 'Initial sync', status: 'configured' });
    } catch (err) {
      results.push({ step: 'Initial sync', status: 'error', error: sanitizeError(err) });
    }

    const hasErrors = results.some((r) => r.status === 'error');
    const configured = results.filter((r) => r.status === 'configured');

    return NextResponse.json({
      success: !hasErrors || configured.length > 0,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
