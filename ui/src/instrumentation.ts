const SIX_HOURS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY = 60 * 1000;

async function searchMissing() {
  const sonarrUrl = process.env.SONARR_URL || 'http://sonarr:8989';
  const sonarrKey = process.env.SONARR_API_KEY || '';
  const radarrUrl = process.env.RADARR_URL || 'http://radarr:7878';
  const radarrKey = process.env.RADARR_API_KEY || '';

  const headers = (key: string) => ({
    'X-Api-Key': key,
    'Content-Type': 'application/json',
  });

  if (sonarrKey) {
    try {
      await fetch(`${sonarrUrl}/api/v3/command`, {
        method: 'POST',
        headers: headers(sonarrKey),
        body: JSON.stringify({ name: 'MissingEpisodeSearch' }),
        cache: 'no-store',
      });
      console.log(`[auto-search] Triggered missing episode search`);
    } catch (err) {
      console.warn(`[auto-search] Sonarr missing search failed: ${err}`);
    }
  }

  if (radarrKey) {
    try {
      await fetch(`${radarrUrl}/api/v3/command`, {
        method: 'POST',
        headers: headers(radarrKey),
        body: JSON.stringify({ name: 'MissingMoviesSearch' }),
        cache: 'no-store',
      });
      console.log(`[auto-search] Triggered missing movies search`);
    } catch (err) {
      console.warn(`[auto-search] Radarr missing search failed: ${err}`);
    }
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Initial search after services have had time to start
  setTimeout(() => {
    searchMissing();
  }, STARTUP_DELAY);

  // Repeat every 6 hours
  setInterval(() => {
    searchMissing();
  }, SIX_HOURS);

  console.log('[auto-search] Scheduled missing content search every 6 hours');
}
