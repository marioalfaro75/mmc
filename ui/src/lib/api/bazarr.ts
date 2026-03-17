const BASE_URL = process.env.BAZARR_URL || 'http://bazarr:6767';
const API_KEY = process.env.BAZARR_API_KEY || '';

async function bazarrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}/api${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bazarr API error: ${res.status} ${res.statusText} — ${body}`);
  }
  // Bazarr returns 204 for successful settings updates
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface BazarrSystemStatus {
  data: {
    bazarr_version: string;
    sonarr_version: string;
    radarr_version: string;
    [key: string]: unknown;
  };
}

interface BazarrServiceSettings {
  apikey: string;
  ip: string;
  port: number;
  ssl: boolean;
  base_url: string;
  [key: string]: unknown;
}

interface BazarrSettings {
  sonarr: BazarrServiceSettings;
  radarr: BazarrServiceSettings;
  [key: string]: unknown;
}

export async function getSystemStatus(): Promise<BazarrSystemStatus> {
  return bazarrFetch<BazarrSystemStatus>('/system/status');
}

export async function getSettings(): Promise<BazarrSettings> {
  return bazarrFetch<BazarrSettings>('/system/settings');
}

export async function updateSettings(settings: Record<string, unknown>): Promise<void> {
  await bazarrFetch<void>('/system/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}
