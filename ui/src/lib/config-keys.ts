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

  return { detected, missing };
}
