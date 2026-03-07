import type { RadarrMovie, RadarrCalendarItem, RadarrSystemStatus, RadarrLookupResult } from '@/lib/types/radarr';

const BASE_URL = process.env.RADARR_URL || 'http://radarr:7878';
const API_KEY = process.env.RADARR_API_KEY || '';

async function radarrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}/api/v3${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-Api-Key': API_KEY,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Radarr API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getMovies(): Promise<RadarrMovie[]> {
  return radarrFetch<RadarrMovie[]>('/movie');
}

export async function getMovieById(id: number): Promise<RadarrMovie> {
  return radarrFetch<RadarrMovie>(`/movie/${id}`);
}

export async function addMovie(movie: Partial<RadarrMovie>): Promise<RadarrMovie> {
  return radarrFetch<RadarrMovie>('/movie', {
    method: 'POST',
    body: JSON.stringify(movie),
  });
}

export async function lookupMovie(term: string): Promise<RadarrLookupResult[]> {
  return radarrFetch<RadarrLookupResult[]>(`/movie/lookup?term=${encodeURIComponent(term)}`);
}

export async function getCalendar(start: string, end: string): Promise<RadarrCalendarItem[]> {
  return radarrFetch<RadarrCalendarItem[]>(`/calendar?start=${start}&end=${end}`);
}

export async function getQueue() {
  return radarrFetch<{ records: unknown[] }>('/queue?includeUnknownMovieItems=true');
}

export async function getSystemStatus(): Promise<RadarrSystemStatus> {
  return radarrFetch<RadarrSystemStatus>('/system/status');
}

export async function getHistory(page = 1, pageSize = 20) {
  return radarrFetch<{ records: unknown[] }>(`/history?page=${page}&pageSize=${pageSize}&sortKey=date&sortDirection=descending`);
}

export async function getLogs(page = 1, pageSize = 50) {
  return radarrFetch<{ records: unknown[] }>(`/log?page=${page}&pageSize=${pageSize}&sortKey=time&sortDirection=descending`);
}
