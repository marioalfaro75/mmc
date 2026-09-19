import { test, expect } from '@playwright/test';

/**
 * The container healthcheck depends on these exact properties.
 *
 * Regression: the Dockerfile originally pointed HEALTHCHECK at /api/health,
 * which fans out to eight services and waits for all of them. One stopped
 * service (SABnzbd, in practice) pushed the response past the 5s probe
 * timeout and Docker marked a perfectly healthy container unhealthy.
 *
 * On top of that, the middleware's API-key exemption matched /api/health
 * exactly, so /api/health/live would have returned 401 and failed the probe
 * anyway.
 */
test.describe('liveness probe', () => {
  test('answers 200 without credentials', async ({ request }) => {
    const res = await request.get('/api/health/live');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('version');
  });

  test('answers fast enough for the 5s healthcheck timeout', async ({ request }) => {
    // Every backing service is pointed at a dead port in this environment.
    // If this endpoint ever starts touching them, it blows the probe budget —
    // which is exactly the bug this guards. 2s leaves generous headroom.
    const started = Date.now();
    const res = await request.get('/api/health/live');
    const elapsed = Date.now() - started;
    expect(res.status()).toBe(200);
    expect(elapsed).toBeLessThan(2_000);
  });

  test('is reachable at the path the Dockerfile probes', async ({ request }) => {
    // Guards against someone renaming the route without updating HEALTHCHECK.
    // The two drift silently: the image still builds, and only a deploy shows
    // the container flapping.
    const res = await request.get('/api/health/live');
    expect(res.ok()).toBeTruthy();
  });
});
