import { test, expect, type Page } from '@playwright/test';

/**
 * Settings → Updates.
 *
 * Regressions this pins down:
 *
 *  * A row whose registry lookup failed (GitHub rate-limited us, so every app
 *    reported "returned 403") must show the error and must NOT offer an Apply
 *    button. Offering to apply a version we could not resolve is how a tag
 *    that does not exist gets written to .env.
 *
 *  * An app already on the newest tag shows "Up to date" — not a button that
 *    does nothing.
 *
 *  * Applying must keep showing progress until the work finishes. An earlier
 *    version flipped the row to the green "Up to date" badge the moment the
 *    POST returned, while the container was still being pulled and recreated.
 */

type App = {
  key: string;
  label: string;
  service: string;
  image: string;
  currentTag: string;
  latestTag: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  sourceRepo: string;
  error?: string;
};

const app = (over: Partial<App> & Pick<App, 'key' | 'label' | 'service'>): App => ({
  image: `lscr.io/linuxserver/${over.service}`,
  currentTag: '1.0.0',
  latestTag: '1.0.0',
  updateAvailable: false,
  releaseUrl: null,
  sourceRepo: `linuxserver/${over.service}`,
  ...over,
});

async function stubUpdates(page: Page, apps: App[]) {
  await page.route('**/api/updates/check*', (route) =>
    route.fulfill({
      json: {
        localSha: 'abc1234567890',
        localBranch: 'main',
        remoteSha: 'abc1234567890',
        updateAvailable: false,
        aheadBy: 0,
        recentMessages: [],
        repoUrl: 'https://github.com/marioalfaro75/mmc',
        compareUrl: null,
        checkedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route('**/api/updates/apps*', (route) => {
    if (route.request().url().includes('/apply')) return route.continue();
    return route.fulfill({ json: { apps, checkedAt: new Date().toISOString() } });
  });
}

async function openUpdatesTab(page: Page) {
  await page.goto('/settings?tab=updates');
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
}

test.describe('per-app updates', () => {
  test('an app with a newer tag offers to apply it', async ({ page }) => {
    await stubUpdates(page, [
      app({ key: 'IMAGE_SONARR', label: 'Sonarr', service: 'sonarr',
            currentTag: '4.0.14', latestTag: '4.0.19', updateAvailable: true }),
    ]);
    await openUpdatesTab(page);

    await expect(page.getByText('4.0.14')).toBeVisible();
    await expect(page.getByRole('button', { name: /Apply 4\.0\.19/ })).toBeVisible();
  });

  test('an app already current shows Up to date, with no button', async ({ page }) => {
    await stubUpdates(page, [
      app({ key: 'IMAGE_RADARR', label: 'Radarr', service: 'radarr',
            currentTag: '6.3.0', latestTag: '6.3.0' }),
    ]);
    await openUpdatesTab(page);

    await expect(page.getByText('Up to date')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Apply/ })).toHaveCount(0);
  });

  test('a failed registry lookup shows the error and offers no Apply', async ({ page }) => {
    // The rate-limit case: we could not find out what the latest version is.
    // Applying an unknown tag would write a nonexistent image into .env.
    await stubUpdates(page, [
      app({ key: 'IMAGE_PROWLARR', label: 'Prowlarr', service: 'prowlarr',
            currentTag: '2.5.2', latestTag: null, updateAvailable: false,
            error: 'Docker Hub /tags returned 403' }),
    ]);
    await openUpdatesTab(page);

    await expect(page.getByText('Docker Hub /tags returned 403')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Apply/ })).toHaveCount(0);
    // Nor should it claim to be fine — we genuinely do not know.
    await expect(page.getByText('Up to date')).toHaveCount(0);
  });

  test('the row keeps showing progress until the apply finishes', async ({ page }) => {
    await stubUpdates(page, [
      app({ key: 'IMAGE_BAZARR', label: 'Bazarr', service: 'bazarr',
            currentTag: '1.5.1', latestTag: '1.6.0', updateAvailable: true }),
    ]);

    // Hold the response open so the in-flight state is observable, the way a
    // real pull-and-recreate takes tens of seconds.
    let release!: () => void;
    const inFlight = new Promise<void>((r) => { release = r; });
    await page.route('**/api/updates/apps/apply', async (route) => {
      await inFlight;
      await route.fulfill({
        json: { status: 'updated', key: 'IMAGE_BAZARR', service: 'bazarr',
                previousTag: '1.5.1', tag: '1.6.0' },
      });
    });

    await openUpdatesTab(page);
    page.once('dialog', (d) => d.accept()); // the confirm()
    await page.getByRole('button', { name: /Apply 1\.6\.0/ }).click();

    // Mid-flight: progress, and specifically NOT the green all-clear.
    await expect(page.getByRole('button', { name: /Updating/ })).toBeVisible();
    await expect(page.getByText('Up to date')).toHaveCount(0);

    release();
    await expect(page.getByText(/Bazarr updated to 1\.6\.0/)).toBeVisible();
  });

  test('a failed apply surfaces the reason', async ({ page }) => {
    await stubUpdates(page, [
      app({ key: 'IMAGE_SEERR', label: 'Seerr', service: 'seerr',
            currentTag: '3.2.0', latestTag: '3.4.0', updateAvailable: true }),
    ]);
    await page.route('**/api/updates/apps/apply', (route) =>
      route.fulfill({
        status: 502,
        json: { error: 'Could not pull ghcr.io/seerr-team/seerr:3.4.0 — is that tag published?' },
      }),
    );

    await openUpdatesTab(page);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Apply 3\.4\.0/ }).click();

    // A silent failure here is what made a broken update look successful.
    await expect(page.getByText(/is that tag published/i)).toBeVisible();
  });
});
