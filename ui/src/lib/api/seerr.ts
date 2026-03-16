const BASE_URL = process.env.SEERR_URL || 'http://seerr:5055';
const API_KEY = process.env.SEERR_API_KEY || '';

async function seerrFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(`Seerr API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface SeerrRequest {
  id: number;
  status: number;
  type: 'movie' | 'tv';
  media: {
    tmdbId: number;
    tvdbId: number;
    status: number;
    mediaType: string;
    posterPath: string;
    title?: string;
    name?: string;
  };
  requestedBy: {
    displayName: string;
    avatar: string;
  };
  createdAt: string;
  updatedAt: string;
}

export async function getRequests(take = 20, skip = 0): Promise<{ results: SeerrRequest[]; pageInfo: { pages: number; results: number } }> {
  return seerrFetch(`/request?take=${take}&skip=${skip}&sort=added`);
}

export async function approveRequest(requestId: number): Promise<void> {
  await seerrFetch(`/request/${requestId}/approve`, { method: 'POST' });
}

export async function declineRequest(requestId: number): Promise<void> {
  await seerrFetch(`/request/${requestId}/decline`, { method: 'POST' });
}

export async function createRequest(body: { mediaType: string; mediaId: number }): Promise<SeerrRequest> {
  return seerrFetch('/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getStatus(): Promise<{ version: string }> {
  return seerrFetch('/status');
}

export async function getSonarrSettings(): Promise<{ id: number }[]> {
  return seerrFetch('/settings/sonarr');
}

export async function getRadarrSettings(): Promise<{ id: number }[]> {
  return seerrFetch('/settings/radarr');
}

export async function testSonarrConnection(hostname: string, port: number, apiKey: string): Promise<{ profiles: { id: number; name: string }[]; rootFolders: { id: number; path: string }[] }> {
  return seerrFetch('/settings/sonarr/test', {
    method: 'POST',
    body: JSON.stringify({ hostname, port, apiKey, useSsl: false, baseUrl: '' }),
  });
}

export async function testRadarrConnection(hostname: string, port: number, apiKey: string): Promise<{ profiles: { id: number; name: string }[]; rootFolders: { id: number; path: string }[] }> {
  return seerrFetch('/settings/radarr/test', {
    method: 'POST',
    body: JSON.stringify({ hostname, port, apiKey, useSsl: false, baseUrl: '' }),
  });
}

export async function addSonarrServer(config: {
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  activeProfileId: number;
  rootFolder: string;
  activeLanguageProfileId?: number;
  isDefault: boolean;
}): Promise<void> {
  await seerrFetch('/settings/sonarr', {
    method: 'POST',
    body: JSON.stringify({ ...config, useSsl: false, baseUrl: '', is4k: false, enableSeasonFolders: true }),
  });
}

export async function addRadarrServer(config: {
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  activeProfileId: number;
  rootFolder: string;
  isDefault: boolean;
}): Promise<void> {
  await seerrFetch('/settings/radarr', {
    method: 'POST',
    body: JSON.stringify({ ...config, useSsl: false, baseUrl: '', is4k: false, minimumAvailability: 'released' }),
  });
}

export interface SeerrSearchResult {
  id: number;
  mediaType: 'movie' | 'tv';
  title?: string;
  name?: string;
  overview: string;
  posterPath: string | null;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage: number;
  mediaInfo?: {
    status: number;
    status4k: number;
  };
}

export async function searchMedia(query: string): Promise<{ results: SeerrSearchResult[] }> {
  return seerrFetch(`/search?query=${encodeURIComponent(query)}&page=1&language=en`);
}
