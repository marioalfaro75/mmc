#!/usr/bin/env node
/**
 * Integration assertions against a running stack.
 *
 * Driven by scripts/integration-test.sh, which brings the stack up first.
 * Everything here talks to real containers over HTTP or reads files they
 * wrote — no stubs. The Playwright suite already covers the UI against a
 * stubbed backend; this covers the seams that stubbing hides.
 *
 *   node scripts/integration-assert.mjs --config-root <dir> --ui <base-url>
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const CONFIG_ROOT = arg('--config-root');
const UI = (arg('--ui', 'http://127.0.0.1:3000') || '').replace(/\/$/, '');
const PROJECT_DIR = arg('--project-dir', process.cwd());

if (!CONFIG_ROOT) {
  console.error('usage: integration-assert.mjs --config-root <dir> [--ui <url>] [--project-dir <dir>]');
  process.exit(2);
}

// Rebuilt here rather than passed as a string, so a path containing a space
// doesn't get word-split into broken arguments.
const COMPOSE = [
  'compose',
  '-f', join(PROJECT_DIR, 'docker-compose.yml'),
  '-f', join(PROJECT_DIR, 'docker-compose.build.yml'),
  '-f', join(PROJECT_DIR, 'docker-compose.ci.yml'),
  '--project-directory', PROJECT_DIR,
];

const failures = [];
const notes = [];
const fail = (check, detail) => { failures.push({ check, detail }); console.log(`  FAIL ${check}`); };
const pass = (check, detail) => console.log(`  ok   ${check}${detail ? ` — ${detail}` : ''}`);
const note = (check, detail) => { notes.push({ check, detail }); console.log(`  note ${check} — ${detail}`); };

const json = async (path) => {
  const res = await fetch(`${UI}${path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/* ------------------------------------------------------------------ */

/**
 * The shape lib/docker.ts listServices() depends on.
 *
 * It reads Name/Service/State/Health/Status/Image off each line of
 * `docker compose ps --format json`. That format is a compose CLI
 * implementation detail with no stability guarantee, and a rename there
 * would empty the System page with no error anywhere. Unit tests can't see
 * it because they'd be asserting against a fixture of the same guess.
 */
function checkComposePsShape() {
  const out = execFileSync('docker', [...COMPOSE, 'ps', '--format', 'json', '-a'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).trim();

  if (!out) { fail('compose ps shape', 'no output — nothing running?'); return []; }

  const rows = out.split('\n').map((l) => JSON.parse(l));
  const required = ['Name', 'Service', 'State', 'Health', 'Status', 'Image'];
  for (const row of rows) {
    const missing = required.filter((k) => !(k in row));
    if (missing.length) {
      fail('compose ps shape',
        `container ${row.Name || row.name || '?'} is missing ${missing.join(', ')} — lib/docker.ts listServices() reads these`);
      return rows;
    }
  }
  pass('compose ps shape', `${rows.length} containers, all ${required.length} fields present`);
  return rows;
}

function checkAllRunning(rows, expected) {
  for (const svc of expected) {
    const row = rows.find((r) => r.Service === svc);
    if (!row) { fail(`${svc} running`, 'no container'); continue; }
    if (row.State !== 'running') {
      fail(`${svc} running`, `state is "${row.State}" (${row.Status})`);
      continue;
    }
    pass(`${svc} running`, row.Status);
  }
}

/**
 * The *arr apps write their API key into config.xml on first boot, and
 * deploy.sh's _xml_api_key greps `<ApiKey>...</ApiKey>` out of it to seed
 * .env. That contract is entirely upstream's to change — Sonarr moving to
 * JSON config, or a different element name, would break auto-seeding and
 * the only symptom would be a stack that silently asks you to paste keys
 * by hand. Assert the format the extractor actually relies on.
 */
function checkArrApiKeyFormat(services) {
  for (const svc of services) {
    const file = join(CONFIG_ROOT, svc, 'config.xml');
    if (!existsSync(file)) {
      fail(`${svc} config.xml`, `not written to ${file} — deploy.sh cannot auto-seed ${svc.toUpperCase()}_API_KEY`);
      continue;
    }
    const m = readFileSync(file, 'utf8').match(/<ApiKey>([^<]+)<\/ApiKey>/);
    if (!m) {
      fail(`${svc} config.xml`, 'no <ApiKey> element — _xml_api_key in deploy.sh greps for exactly this');
      continue;
    }
    if (!/^[0-9a-f]{32}$/.test(m[1])) {
      fail(`${svc} config.xml`, `ApiKey is "${m[1].slice(0, 8)}…", not the expected 32 hex chars`);
      continue;
    }
    pass(`${svc} config.xml`, 'API key extractable');
  }
}

async function checkLiveness() {
  try {
    const body = await json('/api/health/live');
    if (body.ok !== true) { fail('media-ui liveness', `returned ${JSON.stringify(body)}`); return; }
    pass('media-ui liveness', `version ${body.version}`);

    // docker-compose.build.yml passes MMC_VERSION=local, and it tags the
    // built image with the same name the base file pulls from GHCR. That
    // keeps a later plain `up -d` on the local build, but it also means the
    // image NAME cannot tell you which one you got. The version can: if the
    // build were skipped and a published :latest used instead, this whole
    // run would be testing an image that predates the change under review.
    if (body.version !== 'local') {
      fail('media-ui is the local build',
        `reports version "${body.version}", expected "local" — the container is a published image, not a build of this commit`);
    } else {
      pass('media-ui is the local build');
    }
  } catch (err) {
    fail('media-ui liveness', String(err.message));
  }
}

/**
 * The fan-out health check against real *arr APIs. This is the assertion
 * that stubbing cannot reach: it exercises the real HTTP clients, the real
 * API key plumbing from .env through compose into the container, and the
 * real response parsing.
 */
async function checkStackHealth(expectOnline) {
  let body;
  try {
    body = await json('/api/health');
  } catch (err) {
    fail('stack health', String(err.message));
    return;
  }
  const services = body.services || [];
  for (const name of expectOnline) {
    const svc = services.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!svc) { fail(`health: ${name}`, 'not present in /api/health'); continue; }
    if (svc.status !== 'online') {
      fail(`health: ${name}`, `status "${svc.status}"${svc.reason ? ` — ${svc.reason}` : ''}`);
      continue;
    }
    if (!svc.version) { fail(`health: ${name}`, 'online but reported no version'); continue; }
    pass(`health: ${name}`, `online, v${svc.version}`);
  }
}

const tagOf = (image) => {
  // Strip any digest, then take the tag after the last colon — but only if
  // that colon is after the last slash, or a registry:port would look like
  // a tag (ghcr.io:443/foo).
  const ref = image.split('@')[0];
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  return colon > slash ? ref.slice(colon + 1) : null;
};

/**
 * Version resolution against what is genuinely running.
 *
 * The refresh-image-pins workflow opens PRs that bump image tags, and
 * nothing else verifies the dashboard still reports them correctly. The
 * deterministic half — does currentTag match the tag of the running
 * container — is asserted. The upstream half (does latestTag resolve) hits
 * Docker Hub and GitHub, which rate-limit CI runners, so it is reported
 * rather than enforced; a failure there is far more likely to be a 403
 * than a real regression.
 */
async function checkVersionResolution(rows) {
  let body;
  try {
    body = await json('/api/updates/apps');
  } catch (err) {
    fail('updates/apps', String(err.message));
    return;
  }
  const apps = body.apps || [];
  if (!apps.length) { fail('updates/apps', 'returned no apps'); return; }

  let resolved = 0;
  for (const app of apps) {
    const row = rows.find((r) => r.Service === app.service);
    if (!row) continue; // not started in CI — qbittorrent et al
    const running = tagOf(row.Image);
    if (running && app.currentTag !== running) {
      fail(`updates: ${app.service}`,
        `dashboard reports currentTag "${app.currentTag}" but the running image is "${running}"`);
      continue;
    }
    pass(`updates: ${app.service}`, `currentTag ${app.currentTag} matches running image`);
    if (app.latestTag) resolved++;
  }

  const started = apps.filter((a) => rows.some((r) => r.Service === a.service));
  if (resolved === 0 && started.length) {
    note('updates: upstream lookups', `0/${started.length} resolved a latest tag — probably registry rate limiting on the runner, not a regression`);
  } else {
    pass('updates: upstream lookups', `${resolved}/${started.length} resolved a latest tag`);
  }
}

/* ------------------------------------------------------------------ */

const RUNNING = ['prowlarr', 'sonarr', 'radarr', 'bazarr', 'seerr', 'media-ui'];
const XML_ARR = ['sonarr', 'radarr', 'prowlarr'];   // bazarr uses YAML, seerr JSON
const HEALTH_ONLINE = ['Sonarr', 'Radarr', 'Prowlarr'];

console.log('Integration assertions:');
const rows = checkComposePsShape();
checkAllRunning(rows, RUNNING);
checkArrApiKeyFormat(XML_ARR);
await checkLiveness();
await checkStackHealth(HEALTH_ONLINE);
await checkVersionResolution(rows);

if (failures.length) {
  console.error(`\nIntegration: ${failures.length} failure${failures.length === 1 ? '' : 's'}\n`);
  for (const { check, detail } of failures) {
    console.error(`  ${check}`);
    console.error(`    ${detail}\n`);
  }
  process.exit(1);
}
console.log(`\nIntegration: OK${notes.length ? ` (${notes.length} note${notes.length === 1 ? '' : 's'})` : ''}`);
process.exit(0);
