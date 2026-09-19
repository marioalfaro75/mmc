import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level tests for the dashboard.
 *
 * These cover what vitest cannot: that a page actually renders, that links
 * point where they should, that a form does the right thing when you type in
 * it. Several bugs shipped from this repo were invisible to type-checking and
 * unit tests — a link hardcoded to localhost, a security panel reporting a
 * leak that wasn't there, a password field that corrupted .env when edited.
 * All three are a few lines of Playwright to catch.
 *
 * The dashboard normally talks to Sonarr, Radarr, qBittorrent and the Docker
 * socket. None of those exist in CI, so tests stub the API routes they need
 * with page.route(). That keeps them fast and hermetic, at the cost of not
 * proving the real integrations work — which is what the deploy script's
 * post-install checks are for.
 */
export default defineConfig({
  testDir: './e2e',
  // A failing selector should fail fast, not sit for 30s.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  fullyParallel: true,
  // Fail the CI run if someone commits a stray test.only.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
    // Artifacts only for failures — a green run shouldn't produce 200MB of video.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // PLAYWRIGHT_CHROMIUM_PATH lets a sandbox or CI image supply its own
        // Chromium when the bundled version doesn't match what's on disk.
        // Unset (the normal case) → Playwright uses its own download.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  // Build + serve the production bundle rather than `next dev`: dev-mode
  // hydration timing and error overlays differ enough from production to
  // produce flakes that don't reproduce for users. Skipped when E2E_BASE_URL
  // points at something already running.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Runs the standalone server the container actually ships (the
        // Dockerfile's CMD is `node server.js`), not `next start` — which
        // warns it is incompatible with output:standalone and exercises a
        // different code path than production.
        command:
          'npm run build' +
          ' && cp -r .next/static .next/standalone/.next/static' +
          ' && cp -r public .next/standalone/public' +
          ' && PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js',
        url: 'http://127.0.0.1:3100/api/health/live',
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: {
          // Point the service clients at addresses that resolve to nothing, so
          // any request we forgot to stub fails fast instead of hanging until
          // the test times out.
          SONARR_URL: 'http://127.0.0.1:9',
          RADARR_URL: 'http://127.0.0.1:9',
          PROWLARR_URL: 'http://127.0.0.1:9',
          QBITTORRENT_URL: 'http://127.0.0.1:9',
          SEERR_URL: 'http://127.0.0.1:9',
          BAZARR_URL: 'http://127.0.0.1:9',
          GLUETUN_URL: 'http://127.0.0.1:9',
          // No MMC_API_KEY and no admins configured, so the middleware's auth
          // layers stay open and tests don't each need a login dance.
          MMC_API_KEY: '',
        },
      },
});
