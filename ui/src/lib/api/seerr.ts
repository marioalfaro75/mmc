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
