const BASE_URL = process.env.QBITTORRENT_URL || 'http://gluetun:8080';
const USERNAME = process.env.QBITTORRENT_USERNAME || 'admin';
const PASSWORD = process.env.QBITTORRENT_PASSWORD || '';

let sessionCookie: string | null = null;

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`,
    cache: 'no-store',
  });
  const cookie = res.headers.get('set-cookie');
  if (!cookie || !(await res.text()).includes('Ok')) {
    throw new Error('qBittorrent login failed');
  }
  return cookie.split(';')[0];
}

async function qbtFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!sessionCookie) {
    sessionCookie = await login();
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Cookie: sessionCookie,
      ...init?.headers,
    },
    cache: 'no-store',
  });

  // Re-authenticate on 403
  if (res.status === 403) {
    sessionCookie = await login();
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Cookie: sessionCookie,
        ...init?.headers,
      },
      cache: 'no-store',
    });
  }

  if (!res.ok) {
    throw new Error(`qBittorrent API error: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

export interface QbtTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  num_seeds: number;
  num_leechs: number;
  ratio: number;
  eta: number;
  state: string;
  category: string;
  added_on: number;
  completion_on: number;
  content_path: string;
}

export async function getTorrents(): Promise<QbtTorrent[]> {
  return qbtFetch<QbtTorrent[]>('/api/v2/torrents/info');
}

export async function pauseTorrent(hash: string): Promise<void> {
  // v5.0+ renamed pause → stop
  try {
    await qbtFetch<void>(`/api/v2/torrents/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`,
    });
  } catch {
    await qbtFetch<void>(`/api/v2/torrents/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`,
    });
  }
}

export async function resumeTorrent(hash: string): Promise<void> {
  // v5.0+ renamed resume → start
  try {
    await qbtFetch<void>(`/api/v2/torrents/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`,
    });
  } catch {
    await qbtFetch<void>(`/api/v2/torrents/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`,
    });
  }
}

export async function forceStartTorrent(hash: string): Promise<void> {
  await qbtFetch<void>(`/api/v2/torrents/setForceStart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}&value=true`,
  });
}

export async function deleteTorrent(hash: string, deleteFiles = false): Promise<void> {
  await qbtFetch<void>(`/api/v2/torrents/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}&deleteFiles=${deleteFiles}`,
  });
}

export async function setPreferences(prefs: Record<string, unknown>): Promise<void> {
  await qbtFetch<void>('/api/v2/app/setPreferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `json=${encodeURIComponent(JSON.stringify(prefs))}`,
  });
}

export async function createCategory(category: string, savePath: string): Promise<void> {
  await qbtFetch<void>('/api/v2/torrents/createCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `category=${encodeURIComponent(category)}&savePath=${encodeURIComponent(savePath)}`,
  });
}

export async function getVersion(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v2/app/version`, {
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  return res.text();
}
