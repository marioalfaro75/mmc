import type { SonarrSeries, SonarrCalendarItem, SonarrSystemStatus, SonarrLookupResult } from '@/lib/types/sonarr';

const BASE_URL = process.env.SONARR_URL || 'http://sonarr:8989';
const API_KEY = process.env.SONARR_API_KEY || '';

async function sonarrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}/api/v3${path}`;
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
    const body = await res.text().catch(() => '');
    throw new Error(`Sonarr API error: ${res.status} ${res.statusText} — ${body}`);
  }
  return res.json();
}

export async function getSeries(): Promise<SonarrSeries[]> {
  return sonarrFetch<SonarrSeries[]>('/series');
}

export async function getSeriesById(id: number): Promise<SonarrSeries> {
  return sonarrFetch<SonarrSeries>(`/series/${id}`);
}

export async function addSeries(series: Partial<SonarrSeries>): Promise<SonarrSeries> {
  return sonarrFetch<SonarrSeries>('/series', {
    method: 'POST',
    body: JSON.stringify(series),
  });
}

export async function lookupSeries(term: string): Promise<SonarrLookupResult[]> {
  return sonarrFetch<SonarrLookupResult[]>(`/series/lookup?term=${encodeURIComponent(term)}`);
}

export async function getCalendar(start: string, end: string): Promise<SonarrCalendarItem[]> {
  return sonarrFetch<SonarrCalendarItem[]>(`/calendar?start=${start}&end=${end}`);
}

export async function getQueue() {
  return sonarrFetch<{ records: unknown[] }>('/queue?includeUnknownSeriesItems=true');
}

export async function getSystemStatus(): Promise<SonarrSystemStatus> {
  return sonarrFetch<SonarrSystemStatus>('/system/status');
}

export async function getHistory(page = 1, pageSize = 20) {
  return sonarrFetch<{ records: unknown[] }>(`/history?page=${page}&pageSize=${pageSize}&sortKey=date&sortDirection=descending`);
}

export async function getLogs(page = 1, pageSize = 50) {
  return sonarrFetch<{ records: unknown[] }>(`/log?page=${page}&pageSize=${pageSize}&sortKey=time&sortDirection=descending`);
}

// --- Configuration APIs ---

export async function getRootFolders(): Promise<{ id: number; path: string }[]> {
  return sonarrFetch('/rootfolder');
}

export async function addRootFolder(path: string): Promise<void> {
  await sonarrFetch('/rootfolder', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function getDownloadClients(): Promise<{ id: number; name: string; implementation: string }[]> {
  return sonarrFetch('/downloadclient');
}

export async function addDownloadClient(client: Record<string, unknown>): Promise<void> {
  await sonarrFetch('/downloadclient', {
    method: 'POST',
    body: JSON.stringify(client),
  });
}

export async function getNaming(): Promise<Record<string, unknown>> {
  return sonarrFetch('/config/naming');
}

export async function updateNaming(naming: Record<string, unknown>): Promise<void> {
  await sonarrFetch('/config/naming', {
    method: 'PUT',
    body: JSON.stringify(naming),
  });
}

export async function runCommand(body: Record<string, unknown>): Promise<{ id: number }> {
  return sonarrFetch('/command', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getQueueDetails(seriesId?: number): Promise<{ records: { seriesId: number; title: string }[] }> {
  const params = seriesId ? `?seriesId=${seriesId}&includeUnknownSeriesItems=true` : '?includeUnknownSeriesItems=true';
  return sonarrFetch(`/queue${params}`);
}
