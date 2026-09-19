import { test, expect, type Page } from '@playwright/test';

/**
 * Sensitive fields in Settings.
 *
 * Two behaviours, both regressions:
 *
 * 1. Mask contamination. The server sends `••••••••` in place of a stored
 *    secret. Clicking into the field and typing, without first selecting all
 *    and deleting, appended to the mask — so `••••••••hunter2` was written to
 *    .env. A password no service could authenticate with, and the UI showed
 *    `••••••••` afterwards either way, so it looked like it had worked.
 *
 * 2. Reveal. Admins can read a stored secret back. The value is fetched on
 *    demand from an admin-gated endpoint rather than shipped with the page,
 *    and looking at it must not mark the field as edited.
 *
 * env-schema.test.ts covers stripMaskPrefix in isolation; these cover the
 * interaction that produced the contaminated value in the first place.
 */

const MASK = '••••••••';
const REAL_SECRET = 'hunter2-real-stored-value';

/**
 * Stub the env payload.
 *
 * Only `vars` needs to be supplied: the tabs render from the statically
 * imported ENV_SCHEMA, not from the response, so the `schema` key here is
 * unused. An earlier version proxied to the live endpoint with route.fetch()
 * to borrow the real schema — an unnecessary round-trip that turned flaky
 * under parallel workers.
 *
 * TMDB_API_KEY is the only masked field, which keeps the
 * "Reveal (admin only)" button unique on the page.
 */
async function stubSettings(page: Page, opts: { revealAllowed?: boolean } = {}) {
  const { revealAllowed = true } = opts;

  await page.route('**/api/settings/env', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ json: { vars: { TMDB_API_KEY: MASK }, schema: [] } });
  });

  await page.route('**/api/settings/env/reveal*', (route) =>
    revealAllowed
      ? route.fulfill({ json: { key: 'TMDB_API_KEY', value: REAL_SECRET } })
      : route.fulfill({ status: 401, json: { error: 'Unauthorized — admin login required' } }),
  );
}

async function openServicesTab(page: Page) {
  await page.goto('/settings?tab=services');
  await expect(page.locator('#TMDB_API_KEY')).toBeVisible();
}

test.describe('sensitive field editing', () => {
  test('typing into a masked field does not append to the mask', async ({ page }) => {
    await stubSettings(page);
    await openServicesTab(page);

    const field = page.locator('#TMDB_API_KEY');
    await expect(field).toHaveValue(MASK);

    // The exact interaction that used to corrupt .env: click in, type, without
    // clearing first.
    await field.click();
    await field.pressSequentially('newkey123');

    // The mask must be gone, not prefixed.
    await expect(field).toHaveValue('newkey123');
    await expect(field).not.toHaveValue(new RegExp(MASK));
  });

  test('focusing then leaving without typing restores the mask', async ({ page }) => {
    await stubSettings(page);
    await openServicesTab(page);

    const field = page.locator('#TMDB_API_KEY');
    await field.click();
    // Focus clears it so typing is safe — but an idle click must not be
    // allowed to save an empty secret.
    await expect(field).toHaveValue('');
    await field.blur();
    await expect(field).toHaveValue(MASK);
  });

  test('an untouched masked field is not marked modified', async ({ page }) => {
    await stubSettings(page);
    await openServicesTab(page);
    // "(modified)" next to the label drives the save payload; a field nobody
    // touched must not appear in it.
    const label = page.locator('label[for="TMDB_API_KEY"]');
    await expect(label).not.toContainText('modified');
  });
});

test.describe('reveal', () => {
  test('shows the stored value on demand', async ({ page }) => {
    await stubSettings(page);
    await openServicesTab(page);

    const field = page.locator('#TMDB_API_KEY');
    await expect(field).toHaveAttribute('type', 'password');

    await page.locator('button[title="Reveal (admin only)"]').click();

    await expect(field).toHaveValue(REAL_SECRET);
    // Visible as text, not dots — the point of revealing.
    await expect(field).toHaveAttribute('type', 'text');
  });

  test('revealing does not mark the field as edited', async ({ page }) => {
    await stubSettings(page);
    await openServicesTab(page);

    await page.locator('button[title="Reveal (admin only)"]').click();
    await expect(page.locator('#TMDB_API_KEY')).toHaveValue(REAL_SECRET);

    // Looking at a value is not changing it. If this regresses, saving after a
    // peek rewrites .env for no reason.
    const label = page.locator('label[for="TMDB_API_KEY"]');
    await expect(label).not.toContainText('modified');
  });

  test('a rejected reveal leaves the field masked', async ({ page }) => {
    await stubSettings(page, { revealAllowed: false });
    await openServicesTab(page);

    await page.locator('button[title="Reveal (admin only)"]').click();

    // No silent blanking, and no leaking a partial value on failure.
    await expect(page.locator('#TMDB_API_KEY')).toHaveValue(MASK);
    await expect(page.getByText(/admin login required/i).first()).toBeVisible();
  });
});
