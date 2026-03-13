const BASE_URL = process.env.PLEX_URL || 'http://localhost:32400';
const TOKEN = process.env.PLEX_TOKEN || '';

async function plexFetch<T>(path: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${separator}X-Plex-Token=${TOKEN}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Plex API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface PlexMediaItem {
  ratingKey: string;
  title: string;
  type: string;
  thumb: string;
  art: string;
  year: number;
  addedAt: number;
  parentTitle?: string;
  grandparentTitle?: string;
  index?: number;
  parentIndex?: number;
}

export interface PlexLibrarySection {
  key: string;
  title: string;
  type: string;
  count: number;
}

export async function getRecentlyAdded(limit = 10): Promise<PlexMediaItem[]> {
  const data = await plexFetch<{
    MediaContainer: { Metadata: PlexMediaItem[] };
  }>(`/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}`);
  return data.MediaContainer.Metadata || [];
}

export async function getLibrarySections(): Promise<PlexLibrarySection[]> {
  const data = await plexFetch<{
    MediaContainer: { Directory: PlexLibrarySection[] };
  }>('/library/sections');
  return data.MediaContainer.Directory || [];
}

export async function getIdentity(): Promise<{ version: string; machineIdentifier: string }> {
  const data = await plexFetch<{
    MediaContainer: { version: string; machineIdentifier: string };
  }>('/identity');
  return data.MediaContainer;
}
