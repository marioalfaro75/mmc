import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICES_WITH_XML_KEY: Record<string, { envKey: string; configSubdir: string }> = {
  sonarr: { envKey: 'SONARR_API_KEY', configSubdir: 'sonarr' },
  radarr: { envKey: 'RADARR_API_KEY', configSubdir: 'radarr' },
  prowlarr: { envKey: 'PROWLARR_API_KEY', configSubdir: 'prowlarr' },
};

function extractApiKey(xmlContent: string): string | null {
  const match = xmlContent.match(/<ApiKey>([^<]+)<\/ApiKey>/);
  return match ? match[1] : null;
}

function extractSeerrApiKey(configRoot: string): string | null {
  try {
    const settingsPath = join(configRoot, 'seerr', 'settings.json');
    const content = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    // The key may be at settings.main.apiKey or settings.apiKey depending on Seerr version
    const key = settings.main?.apiKey || settings.apiKey;
    if (key && typeof key === 'string' && key.length > 0) {
      return key;
    }
  } catch { /* not available */ }
  return null;
}

export function readApiKeysFromConfig(configRoot: string): {
  detected: Record<string, string>;
  missing: string[];
} {
  const detected: Record<string, string> = {};
  const missing: string[] = [];

  for (const [service, { envKey, configSubdir }] of Object.entries(SERVICES_WITH_XML_KEY)) {
    const configPath = join(configRoot, configSubdir, 'config.xml');
    try {
      const content = readFileSync(configPath, 'utf-8');
      const key = extractApiKey(content);
      if (key) {
        detected[envKey] = key;
      } else {
        missing.push(service);
      }
    } catch {
      missing.push(service);
    }
  }

  // Seerr stores its key in settings.json
  const seerrKey = extractSeerrApiKey(configRoot);
  if (seerrKey) {
    detected.SEERR_API_KEY = seerrKey;
  } else {
    missing.push('seerr');
  }

  return { detected, missing };
}
