const BASE_URL = process.env.QBITTORRENT_URL || 'http://gluetun:8080';
const USERNAME = process.env.QBITTORRENT_USERNAME || 'admin';
const PASSWORD = process.env.QBITTORRENT_PASSWORD || '';

let sessionCookie: string | null = null;

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`,
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
    });
  }

  if (!res.ok) {
    throw new Error(`qBittorrent API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
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
  await qbtFetch<void>(`/api/v2/torrents/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}`,
  });
}

export async function resumeTorrent(hash: string): Promise<void> {
  await qbtFetch<void>(`/api/v2/torrents/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}`,
  });
}

export async function deleteTorrent(hash: string, deleteFiles = false): Promise<void> {
  await qbtFetch<void>(`/api/v2/torrents/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}&deleteFiles=${deleteFiles}`,
  });
}

export async function getVersion(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v2/app/version`, {
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  return res.text();
}
