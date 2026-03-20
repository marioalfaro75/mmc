/**
 * Fallback IP geolocation when Gluetun omits country data.
 * Uses ipinfo.io (free, no key required, 50k req/month).
 */
export async function lookupCountry(ip: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.country ? countryName(data.country) : null;
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
