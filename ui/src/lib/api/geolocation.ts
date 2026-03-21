/**
 * Fallback IP geolocation when Gluetun omits country data.
 * Uses ipinfo.io (free, no key required, 50k req/month).
 * Results are cached for 5 minutes since the VPN IP rarely changes.
 */

let geoCache: { ip: string; country: string; expiresAt: number } | null = null;
const GEO_TTL = 5 * 60_000; // 5 minutes

export async function lookupCountry(ip: string): Promise<string | null> {
  if (geoCache && geoCache.ip === ip && Date.now() < geoCache.expiresAt) {
    return geoCache.country;
  }

  try {
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const country = data.country ? countryName(data.country) : null;
    if (country) {
      geoCache = { ip, country, expiresAt: Date.now() + GEO_TTL };
    }
    return country;
  } catch {
    return null;
  }
}

/** Convert ISO 3166-1 alpha-2 code to display name. */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}
