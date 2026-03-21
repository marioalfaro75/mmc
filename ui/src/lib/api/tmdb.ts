const BASE_URL = 'https://api.themoviedb.org/3';

function getApiKey(): string {
  return process.env.TMDB_API_KEY || '';
}

export function isTmdbConfigured(): boolean {
  return getApiKey().length > 0;
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const apiKey = getApiKey();
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE_URL}${path}${separator}api_key=${apiKey}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TmdbPerson {
  id: number;
  name: string;
  known_for_department: string;
}

interface TmdbPersonSearchResult {
  results: TmdbPerson[];
}

interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
}

interface TmdbTv {
  id: number;
  name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
}

interface TmdbDiscoverMovieResult {
  results: TmdbMovie[];
  total_results: number;
}

interface TmdbDiscoverTvResult {
  results: TmdbTv[];
  total_results: number;
}

// ---------------------------------------------------------------------------
// Public result types (matching existing lookup result shapes)
// ---------------------------------------------------------------------------

export interface TmdbMovieLookupResult {
  title: string;
  sortTitle: string;
  overview: string;
  year: number;
  tmdbId: number;
  titleSlug: string;
  remotePoster: string;
  status: string;
  images: { coverType: string; remoteUrl: string }[];
}

export interface TmdbSeriesLookupResult {
  title: string;
  sortTitle: string;
  overview: string;
  year: number;
  tvdbId: number;
  tmdbId: number;
  titleSlug: string;
  remotePoster: string;
  network: string;
  status: string;
  images: { coverType: string; remoteUrl: string }[];
  seasons: never[];
}

// ---------------------------------------------------------------------------
// Search functions
// ---------------------------------------------------------------------------

/** Search for a person by name, return the most relevant actor's TMDB ID. */
async function findPersonId(name: string): Promise<number | null> {
  const data = await tmdbFetch<TmdbPersonSearchResult>(
    `/search/person?query=${encodeURIComponent(name)}&include_adult=false`
  );
  // Prefer actors over crew
  const actor = data.results.find(p => p.known_for_department === 'Acting') || data.results[0];
  return actor?.id ?? null;
}

/** Discover movies by actor TMDB person ID. */
export async function discoverMoviesByActor(actorName: string): Promise<TmdbMovieLookupResult[]> {
  const personId = await findPersonId(actorName);
  if (!personId) return [];

  const data = await tmdbFetch<TmdbDiscoverMovieResult>(
    `/discover/movie?with_cast=${personId}&sort_by=popularity.desc&include_adult=false`
  );

  return data.results.map(m => {
    const year = m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : 0;
    const slug = m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const poster = m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : '';
    return {
      title: m.title,
      sortTitle: m.title.toLowerCase(),
      overview: m.overview,
      year,
      tmdbId: m.id,
      titleSlug: `${slug}-${m.id}`,
      remotePoster: poster,
      status: 'released',
      images: poster ? [{ coverType: 'poster', remoteUrl: poster }] : [],
    };
  });
}

/** Discover TV shows by actor TMDB person ID. */
export async function discoverSeriesByActor(actorName: string): Promise<TmdbSeriesLookupResult[]> {
  const personId = await findPersonId(actorName);
  if (!personId) return [];

  const data = await tmdbFetch<TmdbDiscoverTvResult>(
    `/discover/tv?with_cast=${personId}&sort_by=popularity.desc&include_adult=false`
  );

  return data.results.map(s => {
    const year = s.first_air_date ? parseInt(s.first_air_date.slice(0, 4), 10) : 0;
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const poster = s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : '';
    return {
      title: s.name,
      sortTitle: s.name.toLowerCase(),
      overview: s.overview,
      year,
      tvdbId: 0, // TMDB doesn't return tvdbId — Sonarr lookup will resolve it
      tmdbId: s.id,
      titleSlug: `${slug}-${s.id}`,
      remotePoster: poster,
      network: '',
      status: 'continuing',
      images: poster ? [{ coverType: 'poster', remoteUrl: poster }] : [],
      seasons: [],
    };
  });
}
