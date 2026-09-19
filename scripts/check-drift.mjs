#!/usr/bin/env node
/**
 * Config drift checker.
 *
 * The dashboard keeps its own copy of what the stack looks like: which
 * services exist, which env vars are settable, which images can be updated.
 * None of those copies is derived from docker-compose.yml, so they drift —
 * and drift is silent. Adding FlareSolverr touched 16 production files; if
 * one had been missed, nothing would have said so.
 *
 * This asserts the copies agree with compose. It needs NO Docker daemon:
 * `docker compose config` is pure interpolation and parsing, so this runs in
 * milliseconds on any machine with the compose CLI.
 *
 *   node scripts/check-drift.mjs [--verbose]
 *
 * Exits 1 listing every mismatch, not just the first — when these drift they
 * tend to drift together, and fixing them one CI run at a time is miserable.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

const failures = [];
const fail = (check, detail) => failures.push({ check, detail });
const ok = (check, note) => { if (VERBOSE) console.log(`  ok   ${check}${note ? ` — ${note}` : ''}`); };

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ------------------------------------------------------------------ */
/* Resolving compose                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compose refuses to parse unless the vars used in volume specs have
 * values — `./:${HOST_PROJECT_DIR}` with an empty value is a hard error
 * ("invalid spec: ./:: empty section between colons"). deploy.sh fills
 * these in on a real install (see its auto-set of HOST_PROJECT_DIR), so
 * this mirrors that rather than working around it.
 */
const SYNTHETIC_ENV = {
  HOST_PROJECT_DIR: '/opt/mmc',
  CONFIG_ROOT: '/tmp/mmc-cfg',
  DATA_ROOT: '/tmp/mmc-data',
  BACKUP_DIR: '/tmp/mmc-bak',
  DOCKER_SUBNET: '172.28.0.0/24',
  LOCAL_SUBNET: '192.168.1.0/24',
  NAS_HOST: 'nas.invalid',
  NAS_SHARE: 'media',
};

let workdir;
function envFile() {
  if (!workdir) workdir = mkdtempSync(join(tmpdir(), 'mmc-drift-'));
  const path = join(workdir, '.env');
  writeFileSync(path, read('.env.example'));
  return path;
}

function composeConfig(extraFiles = []) {
  const args = ['compose', '--env-file', envFile(), '-f', join(ROOT, 'docker-compose.yml')];
  for (const f of extraFiles) args.push('-f', f);
  args.push('config', '--format', 'json');
  const stdout = execFileSync('docker', args, {
    cwd: ROOT,
    env: { ...process.env, ...SYNTHETIC_ENV },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/* ------------------------------------------------------------------ */
/* Extracting the hand-maintained lists                                 */
/* ------------------------------------------------------------------ */

/**
 * These are regex-extracted from TypeScript, which is brittle — so a
 * pattern that stops matching is treated as a FAILURE, not a pass. If you
 * rename one of these constants, this check tells you to update it here
 * rather than quietly going green while checking nothing.
 */
function extractList(file, pattern, label) {
  const src = read(file);
  const m = src.match(pattern);
  if (!m) {
    fail(label, `could not find the list in ${file} — was the constant renamed? Update scripts/check-drift.mjs.`);
    return null;
  }
  return [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
}

// kind: 'complete' must equal the compose service set exactly.
//       'subset'   may list fewer, but every name must be a real service.
const SERVICE_LISTS = [
  { label: 'docker.ts VALID_SERVICES', file: 'ui/src/lib/docker.ts',
    pattern: /VALID_SERVICES = new Set\(\[([\s\S]*?)\]\)/, kind: 'complete' },
  { label: 'docker.ts VPN_DEPENDENT_SERVICES', file: 'ui/src/lib/docker.ts',
    pattern: /VPN_DEPENDENT_SERVICES = \[([\s\S]*?)\]/, kind: 'subset' },
  { label: 'env-schema.ts ALL_SERVICES', file: 'ui/src/lib/env-schema.ts',
    pattern: /ALL_SERVICES = \[([\s\S]*?)\]/, kind: 'complete' },
  { label: 'env-schema.ts VPN_SERVICES', file: 'ui/src/lib/env-schema.ts',
    pattern: /VPN_SERVICES = \[([\s\S]*?)\]/, kind: 'subset' },
  { label: 'logs/page.tsx SERVICE_LIST', file: 'ui/src/app/logs/page.tsx',
    pattern: /SERVICE_LIST = \[([\s\S]*?)\]/, kind: 'complete' },
  { label: 'system/page.tsx SERVICE_GROUPS', file: 'ui/src/app/system/page.tsx',
    pattern: /SERVICE_GROUPS[^=]*= \[([\s\S]*?)\n\];/, kind: 'complete' },
  { label: 'api/network MONITORED_CONTAINERS', file: 'ui/src/app/api/network/route.ts',
    pattern: /MONITORED_CONTAINERS = \[([\s\S]*?)\]/, kind: 'subset' },
];

/* ------------------------------------------------------------------ */
/* Checks                                                               */
/* ------------------------------------------------------------------ */

function checkServiceLists(config) {
  const services = Object.keys(config.services).sort();

  for (const { label, file, pattern, kind } of SERVICE_LISTS) {
    const list = extractList(file, pattern, label);
    if (!list) continue;

    const phantom = [...new Set(list)].filter((s) => !services.includes(s));
    if (phantom.length) {
      fail(label, `lists ${phantom.join(', ')} — not a service in docker-compose.yml`);
      continue;
    }

    if (kind === 'complete') {
      const missing = services.filter((s) => !list.includes(s));
      if (missing.length) {
        fail(label, `missing ${missing.join(', ')} — every compose service must appear here`);
        continue;
      }
    }
    ok(label, `${list.length}/${services.length} services`);
  }
  return services;
}

function checkImagePins(config) {
  // Every service pinned via an IMAGE_* var needs an update source, or the
  // Updates tab silently cannot offer it a new version.
  const composeImageVars = new Set(
    [...read('docker-compose.yml').matchAll(/\$\{(IMAGE_[A-Z0-9_]+)/g)].map((m) => m[1]),
  );
  const src = read('ui/src/lib/app-updates.ts');
  const block = src.match(/APP_UPDATE_SOURCES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    fail('app-updates.ts APP_UPDATE_SOURCES', 'could not find the map — was it renamed? Update scripts/check-drift.mjs.');
    return;
  }
  const declared = new Set([...block[1].matchAll(/^\s*(IMAGE_[A-Z0-9_]+)\s*:/gm)].map((m) => m[1]));

  const unpinnable = [...composeImageVars].filter((v) => !declared.has(v)).sort();
  const orphaned = [...declared].filter((v) => !composeImageVars.has(v)).sort();
  if (unpinnable.length) fail('app-updates.ts APP_UPDATE_SOURCES', `no update source for ${unpinnable.join(', ')} — the Updates tab cannot offer these a version`);
  if (orphaned.length) fail('app-updates.ts APP_UPDATE_SOURCES', `declares ${orphaned.join(', ')}, which docker-compose.yml never uses`);
  if (!unpinnable.length && !orphaned.length) ok('app-updates.ts APP_UPDATE_SOURCES', `${declared.size} images`);
}

/**
 * Vars deploy.sh computes rather than the user setting them, or that the
 * shell already provides. They are legitimately absent from one side.
 */
const ENV_EXEMPT = new Set([
  'HOST_PROJECT_DIR', // auto-set by deploy.sh (see its check_env_file)
  'HOME',             // provided by the shell
]);

function checkEnvVars() {
  const exampleKeys = new Set(
    [...read('.env.example').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
  );
  const schemaKeys = new Set(
    [...read('ui/src/lib/env-schema.ts').matchAll(/key: '([A-Z][A-Z0-9_]*)'/g)].map((m) => m[1]),
  );

  const notEditable = [...exampleKeys].filter((k) => !schemaKeys.has(k) && !ENV_EXEMPT.has(k)).sort();
  const notShipped = [...schemaKeys].filter((k) => !exampleKeys.has(k) && !ENV_EXEMPT.has(k)).sort();

  if (notEditable.length) {
    fail('.env.example vs env-schema.ts', `${notEditable.join(', ')} ship in .env.example but are absent from ENV_SCHEMA — not editable in Settings`);
  }
  if (notShipped.length) {
    fail('env-schema.ts vs .env.example', `${notShipped.join(', ')} are in ENV_SCHEMA but absent from .env.example — Settings offers to set something a fresh install has no record of`);
  }
  if (!notEditable.length && !notShipped.length) ok('.env.example vs env-schema.ts', `${exampleKeys.size} vars`);

  // Anything compose interpolates must have a home in .env.example, or a
  // fresh install gets an empty value with no hint that it was needed.
  const composeRefs = new Set(
    [...read('docker-compose.yml').matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]),
  );
  const undeclared = [...composeRefs].filter((v) => !exampleKeys.has(v) && !ENV_EXEMPT.has(v)).sort();
  if (undeclared.length) {
    fail('docker-compose.yml vs .env.example', `${undeclared.join(', ')} interpolated by compose but never declared in .env.example`);
  } else {
    ok('docker-compose.yml vs .env.example', `${composeRefs.size} interpolated vars`);
  }
}

/**
 * The dependency-direction invariant.
 *
 * media-ui is the tool you reach for when the stack is broken, so it must
 * not acquire a hard dependency on any part of the stack it reports on.
 * Two concrete ways that has already gone wrong:
 *
 *   1. A CIFS/NFS volume mounted into media-ui. Docker performs the mount
 *      at container start and there is no "mount if available" — so a NAS
 *      blip stopped the dashboard booting, taking away the one tool you'd
 *      use to diagnose it.
 *   2. Docker's HEALTHCHECK pointed at /api/health, which fans out to every
 *      service. One unreachable service marked the dashboard unhealthy
 *      while it was serving perfectly well. (Fixed by /api/health/live.)
 *
 * Both are the same mistake. This asserts the compose-level half of it,
 * against the fully resolved config, including with the NAS override
 * applied — which is where the first one actually lived.
 */
const NETWORK_VOLUME_TYPES = new Set(['cifs', 'nfs', 'nfs4', 'smb3']);

function assertMediaUiIndependent(config, context) {
  const svc = config.services['media-ui'];
  if (!svc) {
    fail(`media-ui independence (${context})`, 'no media-ui service in the resolved config');
    return;
  }

  const networkBacked = new Set(
    Object.entries(config.volumes || {})
      .filter(([, v]) => NETWORK_VOLUME_TYPES.has(v?.driver_opts?.type))
      .map(([name]) => name),
  );
  const mounted = (svc.volumes || [])
    .filter((v) => v.type === 'volume' && networkBacked.has(v.source))
    .map((v) => v.source);
  if (mounted.length) {
    fail(`media-ui independence (${context})`,
      `mounts network-backed volume(s) ${mounted.join(', ')} — a NAS outage would stop the dashboard from starting, removing the tool needed to diagnose it`);
  }

  const hardDeps = Object.entries(svc.depends_on || {})
    .filter(([, d]) => d.condition === 'service_healthy')
    .map(([name]) => name);
  if (hardDeps.length) {
    fail(`media-ui independence (${context})`,
      `depends_on service_healthy: ${hardDeps.join(', ')} — the dashboard must start even when they are down`);
  }

  if (!mounted.length && !hardDeps.length) ok(`media-ui independence (${context})`);
}

/**
 * Build the NAS override the way the Migration wizard does, from the same
 * service list the generator uses, and check the composed result. This
 * catches someone adding 'media-ui' to NAS_MOUNTED_SERVICES — the exact
 * change that caused the original outage.
 */
function checkNasOverride() {
  const list = extractList(
    'ui/src/lib/nas-override.ts',
    /NAS_MOUNTED_SERVICES = \[([\s\S]*?)\]/,
    'nas-override.ts NAS_MOUNTED_SERVICES',
  );
  if (!list) return;

  if (list.includes('media-ui')) {
    fail('nas-override.ts NAS_MOUNTED_SERVICES',
      'includes media-ui — see the module header; a failed mount stops the dashboard starting');
    return;
  }

  const yaml = `volumes:
  nas-media:
    driver: local
    driver_opts:
      type: cifs
      device: "//\${NAS_HOST}/\${NAS_SHARE}"
      o: "username=guest,password=,vers=3.0,soft"
services:
${list.map((s) => `  ${s}:\n    volumes:\n      - nas-media:/mnt/nas/media`).join('\n')}
`;
  const path = join(workdir || (workdir = mkdtempSync(join(tmpdir(), 'mmc-drift-'))), 'nas.yml');
  writeFileSync(path, yaml);
  assertMediaUiIndependent(composeConfig([path]), 'with NAS override');
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

function main() {
  let config;
  try {
    config = composeConfig();
  } catch (err) {
    const msg = String(err.stderr || err.message).trim();
    console.error(`docker compose config failed — cannot check anything against it.\n${msg}`);
    process.exit(2);
  }

  if (VERBOSE) console.log('Checking config drift:');
  const services = checkServiceLists(config);
  checkImagePins(config);
  checkEnvVars();
  assertMediaUiIndependent(config, 'base compose');
  checkNasOverride();

  if (!failures.length) {
    console.log(`Config drift: OK (${services.length} services, no drift)`);
    return 0;
  }

  console.error(`\nConfig drift: ${failures.length} problem${failures.length === 1 ? '' : 's'}\n`);
  for (const { check, detail } of failures) {
    console.error(`  ${check}`);
    console.error(`    ${detail}\n`);
  }
  return 1;
}

let code = 2;
try {
  code = main();
} finally {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
}
process.exit(code);
