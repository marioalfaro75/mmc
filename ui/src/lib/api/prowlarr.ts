const BASE_URL = process.env.PROWLARR_URL || 'http://prowlarr:9696';
const API_KEY = process.env.PROWLARR_API_KEY || '';

async function prowlarrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}/api/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-Api-Key': API_KEY,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Prowlarr API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getSystemStatus() {
  return prowlarrFetch<{ version: string }>('/system/status');
}

export async function getIndexers() {
  return prowlarrFetch<unknown[]>('/indexer');
}

// --- Configuration APIs ---

export async function getApplications(): Promise<{ id: number; name: string; implementation: string }[]> {
  return prowlarrFetch('/applications');
}

export async function addApplication(app: Record<string, unknown>): Promise<void> {
  await prowlarrFetch('/applications', {
    method: 'POST',
    body: JSON.stringify(app),
  });
}
