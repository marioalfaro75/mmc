const BASE_URL = process.env.GLUETUN_URL || 'http://gluetun:8000';

async function gluetunFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
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
  return gluetunFetch<GluetunStatus>('/v1/openvpn/status');
}

export async function getPublicIP(): Promise<GluetunPublicIP> {
  return gluetunFetch<GluetunPublicIP>('/v1/publicip/ip');
}
