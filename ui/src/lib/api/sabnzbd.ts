const BASE_URL = process.env.SABNZBD_URL || 'http://gluetun:8081';
const API_KEY = process.env.SABNZBD_API_KEY || '';

async function sabnzbdFetch<T>(params: Record<string, string>): Promise<T> {
  const searchParams = new URLSearchParams({
    apikey: API_KEY,
    output: 'json',
    ...params,
  });
  const res = await fetch(`${BASE_URL}/api?${searchParams}`);
  if (!res.ok) {
    throw new Error(`SABnzbd API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
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
