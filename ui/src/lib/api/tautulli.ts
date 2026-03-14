const BASE_URL = process.env.TAUTULLI_URL || 'http://tautulli:8181';
const API_KEY = process.env.TAUTULLI_API_KEY || '';

async function tautulliFetch<T>(cmd: string, params: Record<string, string> = {}): Promise<T> {
  const searchParams = new URLSearchParams({
    apikey: API_KEY,
    cmd,
    ...params,
  });
  const res = await fetch(`${BASE_URL}/api/v2?${searchParams}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Tautulli API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.response.data;
}

export async function getActivity() {
  return tautulliFetch<{ sessions: unknown[]; stream_count: string }>('get_activity');
}

export async function getHomeStats() {
  return tautulliFetch<unknown[]>('get_home_stats');
}

export async function getServerInfo() {
  return tautulliFetch<{ pms_version: string }>('get_server_info');
}
