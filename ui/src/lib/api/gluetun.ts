const BASE_URL = process.env.GLUETUN_URL || 'http://gluetun:8000';
const GLUETUN_USER = 'mmc';
const GLUETUN_PASS = process.env.GLUETUN_CONTROL_PASSWORD || 'changeme';

// ---------------------------------------------------------------------------
// Server-side in-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  return null;
}

function setCache<T>(key: string, data: T, ttlMs: number): T {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/** Cache TTLs */
const TTL_STATUS = 5_000;     // VPN connected/disconnected — 5 s
const TTL_PUBLIC_IP = 60_000; // IP + country rarely change — 60 s
const TTL_PORT_FWD = 30_000;  // Port forward — 30 s

// ---------------------------------------------------------------------------
// Gluetun HTTP helper
// ---------------------------------------------------------------------------

async function gluetunFetch<T>(path: string): Promise<T> {
  const credentials = Buffer.from(`${GLUETUN_USER}:${GLUETUN_PASS}`).toString('base64');
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: 'no-store',
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) {
    throw new Error(`Gluetun API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GluetunStatus {
  status: string;
}

export interface GluetunPublicIP {
  public_ip: string;
  region: string;
  country: string;
}

export interface GluetunPortForward {
  port: number;
}

// ---------------------------------------------------------------------------
// Cached public API
// ---------------------------------------------------------------------------

export async function getVpnStatus(): Promise<GluetunStatus> {
  const cached = getCached<GluetunStatus>('vpn-status');
  if (cached) return cached;

  const data = await gluetunFetch<GluetunStatus>('/v1/vpn/status');
  return setCache('vpn-status', data, TTL_STATUS);
}

export async function getPublicIP(): Promise<GluetunPublicIP> {
  const cached = getCached<GluetunPublicIP>('public-ip');
  if (cached) return cached;

  const data = await gluetunFetch<GluetunPublicIP>('/v1/publicip/ip');
  if (data.public_ip) return setCache('public-ip', data, TTL_PUBLIC_IP);

  // Gluetun's IP updater may return empty — fetch directly via its network
  const fallback = await getPublicIPViaExec();
  return setCache('public-ip', fallback, TTL_PUBLIC_IP);
}

export async function getPortForward(): Promise<GluetunPortForward> {
  const cached = getCached<GluetunPortForward>('port-forward');
  if (cached) return cached;

  const data = await gluetunFetch<GluetunPortForward>('/v1/portforward');
  return setCache('port-forward', data, TTL_PORT_FWD);
}

// ---------------------------------------------------------------------------
// Fallback: exec into gluetun container
// ---------------------------------------------------------------------------

async function getPublicIPViaExec(): Promise<GluetunPublicIP> {
  const { execSync } = await import('child_process');
  const raw = execSync(
    'docker exec gluetun wget -q -O - https://ipinfo.io/json',
    { timeout: 5000 }
  ).toString().trim();
  const data = JSON.parse(raw);
  return {
    public_ip: data.ip || '',
    region: data.region || '',
    country: countryName(data.country || ''),
  };
}

/** Convert ISO 3166-1 alpha-2 code to display name. */
function countryName(code: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}
