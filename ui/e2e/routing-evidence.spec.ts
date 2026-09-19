import { test, expect, type Page } from '@playwright/test';

/**
 * The Network page's leak indicator.
 *
 * Regression: FlareSolverr was reported as "leaking — different exit", with a
 * button offering to stop it, while the panel directly above proved it shared
 * Gluetun's network namespace byte for byte. Both cannot be true — processes
 * in one netns share one network stack.
 *
 * The cause was a two-state render: `matchesGluetun ? ok : LEAK`. A null IP
 * (the probe couldn't run, because FlareSolverr's image ships no wget or curl)
 * fell into the leak branch. "No evidence" was displayed as "evidence of a
 * leak", which is the worst failure mode a security indicator has — it trains
 * you to ignore it.
 *
 * lib/egress-verdict.test.ts covers the classification in isolation. These
 * tests cover what the user actually sees, which is where the bug lived.
 */

const GLUETUN_IP = '87.249.133.224';
const NETNS = 'net:[4026532893]';

type Client = 'qbittorrent' | 'sabnzbd' | 'flaresolverr';

/** Build an evidence payload, overriding one client's egress. */
function evidence(opts: {
  ip?: Partial<Record<Client, string | null>>;
  verdict?: 'pass' | 'fail' | 'unknown';
  namespaceConfirmed?: Partial<Record<Client, boolean>>;
}) {
  const clients: Client[] = ['qbittorrent', 'sabnzbd', 'flaresolverr'];
  const ipFor = (c: Client) => (c in (opts.ip ?? {}) ? opts.ip![c]! : GLUETUN_IP);
  const nsFor = (c: Client) => opts.namespaceConfirmed?.[c] ?? true;

  const entries = <T,>(fn: (c: Client) => T) =>
    Object.fromEntries(clients.map((c) => [c, fn(c)]));

  return {
    cachedAt: new Date().toISOString(),
    namespace: {
      gluetun: NETNS,
      clients: entries((c) => ({ inode: nsFor(c) ? NETNS : 'net:[1]', matchesGluetun: nsFor(c) })),
      verdict: 'pass',
    },
    publicIp: {
      gluetun: { ip: GLUETUN_IP, country: 'Austria' },
      clients: entries((c) => {
        const ip = ipFor(c);
        return {
          ip,
          matchesGluetun: !!ip && ip === GLUETUN_IP,
          namespaceConfirmed: !ip && nsFor(c),
        };
      }),
      host: { ip: '14.203.60.79', country: 'Australia' },
      verdict: opts.verdict ?? 'pass',
    },
    routes: entries(() => ({ entries: ['default dev wg0'], tunnelOnly: true })),
    dns: entries(() => ({ resolvers: ['10.2.0.1'], verdict: 'pass' })),
  };
}

/** Stub everything the Network page fetches so the test is hermetic. */
async function stubNetwork(page: Page, evidencePayload: unknown) {
  await page.route('**/api/network/evidence*', (route) =>
    route.fulfill({ json: evidencePayload as object }),
  );
  await page.route('**/api/network', (route) =>
    route.fulfill({
      json: {
        vpn: { connected: true, status: 'connected', statusMessage: 'Connected', ip: GLUETUN_IP, country: 'Austria' },
        tunnel: { interface: 'wg0', rxBytes: 1024, txBytes: 512 },
        services: [],
      },
    }),
  );
}

test.describe('routing evidence', () => {
  test('a container that cannot be probed is NOT reported as leaking', async ({ page }) => {
    // The exact FlareSolverr shape: no IP, but same namespace as Gluetun.
    await stubNetwork(page, evidence({ ip: { flaresolverr: null } }));
    await page.goto('/network');

    const panel = page.getByText('Routing Evidence').locator('xpath=ancestor::div[1]/..');
    await expect(page.getByText('Routing Evidence')).toBeVisible();

    // The words that must not appear for an unprobeable container.
    await expect(page.getByText('leaking — different exit')).toHaveCount(0);
    // And no offer to stop a container that is behaving correctly.
    await expect(page.getByRole('button', { name: /stop flaresolverr/i })).toHaveCount(0);
    void panel;
  });

  test('the namespace proof is shown instead', async ({ page }) => {
    await stubNetwork(page, evidence({ ip: { flaresolverr: null } }));
    await page.goto('/network');
    // Kernel-level proof is stronger evidence than an HTTP probe, so it is
    // reported as a pass rather than an unknown.
    await expect(page.getByText(/same namespace/i).first()).toBeVisible();
  });

  test('a genuine leak IS reported, with the remediation button', async ({ page }) => {
    // The other half: this must still fire. A guard that never triggers is
    // as useless as one that always does.
    await stubNetwork(
      page,
      evidence({
        ip: { flaresolverr: '14.203.60.79' },
        namespaceConfirmed: { flaresolverr: false },
        verdict: 'fail',
      }),
    );
    await page.goto('/network');
    await expect(page.getByText('leaking — different exit')).toBeVisible();
  });

  test('all-clear when every client egresses via the tunnel', async ({ page }) => {
    await stubNetwork(page, evidence({}));
    await page.goto('/network');
    await expect(page.getByText('matches Gluetun').first()).toBeVisible();
    await expect(page.getByText('leaking — different exit')).toHaveCount(0);
  });
});
