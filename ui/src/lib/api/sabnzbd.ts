import { AuthRequiredError } from './errors';

const BASE_URL = process.env.SABNZBD_URL || 'http://gluetun:8081';
const API_KEY = process.env.SABNZBD_API_KEY || '';

async function sabnzbdFetch<T>(params: Record<string, string>): Promise<T> {
  if (!API_KEY) {
    throw new AuthRequiredError(
      'SABnzbd',
      'SABNZBD_API_KEY',
      'use Settings → Services → Auto-Detect API Keys',
    );
  }
  const searchParams = new URLSearchParams({
    apikey: API_KEY,
    output: 'json',
    ...params,
  });
  const res = await fetch(`${BASE_URL}/api?${searchParams}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`SABnzbd API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as T & { status?: false; error?: string };
  // SABnzbd returns 200 even on bad API key — the failure is signalled
  // inside the JSON body: { status: false, error: "API Key Incorrect" }.
  if (
    data &&
    typeof data === 'object' &&
    'status' in data &&
    (data as { status?: unknown }).status === false &&
    /api key/i.test(((data as { error?: string }).error) || '')
  ) {
    throw new AuthRequiredError(
      'SABnzbd',
      'SABNZBD_API_KEY',
      (data as { error?: string }).error || 'wrong API key',
    );
  }
  return data;
}

export interface SabnzbdSlot {
  nzo_id: string;
  filename: string;
  mb: string;
  mbleft: string;
  percentage: string;
  status: string;
  timeleft: string;
  cat: string;
  eta: string;
}

export interface SabnzbdQueue {
  slots: SabnzbdSlot[];
  speed: string;
  sizeleft: string;
  noofslots: number;
  status: string;
  paused: boolean;
}

export interface SabnzbdHistorySlot {
  nzo_id: string;
  name: string;
  bytes: number;
  status: string;
  category: string;
  completed: number;
  fail_message: string;
}

export async function getQueue(): Promise<SabnzbdQueue> {
  const data = await sabnzbdFetch<{ queue: SabnzbdQueue }>({ mode: 'queue' });
  return data.queue;
}

export async function getHistory(): Promise<SabnzbdHistorySlot[]> {
  const data = await sabnzbdFetch<{ history: { slots: SabnzbdHistorySlot[] } }>({ mode: 'history', limit: '50' });
  return data.history.slots;
}

export async function pauseItem(nzoId: string): Promise<void> {
  await sabnzbdFetch({ mode: 'queue', name: 'pause', value: nzoId });
}

export async function resumeItem(nzoId: string): Promise<void> {
  await sabnzbdFetch({ mode: 'queue', name: 'resume', value: nzoId });
}

export async function deleteItem(nzoId: string): Promise<void> {
  await sabnzbdFetch({ mode: 'queue', name: 'delete', value: nzoId });
}

export async function getVersion(): Promise<string> {
  const data = await sabnzbdFetch<{ version: string }>({ mode: 'version' });
  return data.version;
}
