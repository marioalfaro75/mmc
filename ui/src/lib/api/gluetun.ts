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
  return gluetunFetch<GluetunPublicIP>('/v1/publicip/ip');
}

export interface GluetunPortForward {
  port: number;
}

export async function getPortForward(): Promise<GluetunPortForward> {
  return gluetunFetch<GluetunPortForward>('/v1/portforward');
}
