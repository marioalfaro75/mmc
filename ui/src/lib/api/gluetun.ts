const BASE_URL = process.env.GLUETUN_URL || 'http://gluetun:8000';
const GLUETUN_USER = 'mmc';
const GLUETUN_PASS = process.env.GLUETUN_CONTROL_PASSWORD || 'changeme';

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

export interface GluetunStatus {
  status: string;
}

export interface GluetunPublicIP {
  public_ip: string;
  region: string;
  country: string;
}

export async function getVpnStatus(): Promise<GluetunStatus> {
  return gluetunFetch<GluetunStatus>('/v1/vpn/status');
}

export async function getPublicIP(): Promise<GluetunPublicIP> {
  const data = await gluetunFetch<GluetunPublicIP>('/v1/publicip/ip');
  if (data.public_ip) return data;

  // Gluetun's IP updater may return empty — fetch directly via its network
  return getPublicIPViaExec();
}

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

export interface GluetunPortForward {
  port: number;
}

export async function getPortForward(): Promise<GluetunPortForward> {
  return gluetunFetch<GluetunPortForward>('/v1/portforward');
}
