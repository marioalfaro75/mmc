import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SERVICES, SERVICE_NAMES, APP_UPDATE_SOURCES } from './services';
import { ENV_SCHEMA } from './env-schema';
import { NAS_MOUNTED_SERVICES, generateOverrideYaml } from './nas-override';

/**
 * The manifest against reality.
 *
 * lib/services.ts is the dashboard's single description of the stack, but
 * docker-compose.yml is what actually runs. Nothing derives one from the
 * other, so this asserts they agree — the manifest cannot quietly fall
 * behind compose the way the nine hand-written lists it replaced did.
 *
 * `docker compose config` needs NO Docker daemon: it is interpolation and
 * parsing, not orchestration, so these run in milliseconds and cannot flake.
 *
 * This replaced scripts/check-drift.mjs, which had to regex-parse the same
 * facts out of seven TypeScript files because there was no single place to
 * import them from. With the manifest there is, and importing beats parsing.
 */

const ROOT = resolve(__dirname, '../../..');

/**
 * Compose refuses to parse unless vars used in volume specs have values —
 * `./:${HOST_PROJECT_DIR}` with an empty value is a hard error. deploy.sh
 * fills these in on a real install; this mirrors that.
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

interface ComposeVolume { type: string; source?: string }
interface ComposeService {
  volumes?: ComposeVolume[];
  depends_on?: Record<string, { condition?: string }>;
  network_mode?: string;
}
interface ComposeConfig {
  services: Record<string, ComposeService>;
  volumes?: Record<string, { driver_opts?: { type?: string } }>;
}

let workdir: string;
let config: ComposeConfig;
let composeSource: string;
/** Set when the compose CLI isn't installed — locally that skips, in CI it fails. */
let unavailable: string | null = null;

function composeConfig(extraFiles: string[] = []): ComposeConfig {
  const envPath = join(workdir, '.env');
  const args = ['compose', '--env-file', envPath, '-f', join(ROOT, 'docker-compose.yml')];
  for (const f of extraFiles) args.push('-f', f);
  args.push('config', '--format', 'json');
  const stdout = execFileSync('docker', args, {
    cwd: ROOT,
    env: { ...process.env, ...SYNTHETIC_ENV },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout) as ComposeConfig;
}

beforeAll(() => {
  composeSource = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  workdir = mkdtempSync(join(tmpdir(), 'mmc-manifest-'));
  writeFileSync(join(workdir, '.env'), readFileSync(join(ROOT, '.env.example'), 'utf8'));
  try {
    config = composeConfig();
  } catch (err) {
    const msg = String((err as { stderr?: string }).stderr || (err as Error).message).trim();
    // A runner without the compose CLI must not silently pass this suite.
    if (process.env.CI) throw new Error(`docker compose config failed in CI:\n${msg}`);
    unavailable = msg;
  }
});

const maybe = (name: string, fn: () => void) =>
  it(name, () => {
    if (unavailable) {
      console.warn(`skipping "${name}" — docker compose unavailable: ${unavailable.split('\n')[0]}`);
      return;
    }
    fn();
  });

/** The `image:` var each service is pinned to, read from the raw YAML. */
function imageVarsFromCompose(): Record<string, string> {
  const out: Record<string, string> = {};
  let current = '';
  for (const line of composeSource.split('\n')) {
    const svc = line.match(/^ {2}([a-z0-9][a-z0-9-]*):\s*$/);
    if (svc) { current = svc[1]; continue; }
    const img = line.match(/^ {4}image:\s*\$\{([A-Z0-9_]+)/);
    if (img && current) out[current] = img[1];
  }
  return out;
}

describe('manifest vs docker-compose.yml', () => {
  maybe('declares exactly the services compose defines', () => {
    expect([...SERVICE_NAMES].sort()).toEqual(Object.keys(config.services).sort());
  });

  maybe('agrees with compose about which services share a network namespace', () => {
    // The manifest's `netns` drives the Network page topology, the routing
    // evidence panel and the VPN-settings blast radius. When it disagreed
    // with compose, the topology diagram told the user FlareSolverr used
    // their regular internet connection while it was in fact tunnelled.
    const fromCompose: Record<string, string> = {};
    for (const [name, svc] of Object.entries(config.services)) {
      const m = svc.network_mode?.match(/^service:(.+)$/);
      if (m) fromCompose[name] = m[1];
    }
    const fromManifest = Object.fromEntries(
      SERVICES.filter((s) => s.netns).map((s) => [s.name, s.netns as string]),
    );
    expect(fromManifest).toEqual(fromCompose);
  });

  maybe('pins each service to the IMAGE_* var compose interpolates', () => {
    const fromCompose = imageVarsFromCompose();
    const fromManifest = Object.fromEntries(SERVICES.map((s) => [s.name, s.imageEnvKey]));
    expect(fromManifest).toEqual(fromCompose);
  });

  it('gives every update source a service that declares that image', () => {
    // Otherwise the Updates tab offers a version for something that either
    // does not exist or is pinned by a different var.
    for (const imageKey of Object.keys(APP_UPDATE_SOURCES)) {
      expect(SERVICES.map((s) => s.imageEnvKey)).toContain(imageKey);
    }
  });

  it('points every netns at a service that exists', () => {
    for (const svc of SERVICES) {
      if (!svc.netns) continue;
      expect(SERVICE_NAMES, `${svc.name}.netns`).toContain(svc.netns);
    }
  });

  it('has no duplicate names or image keys', () => {
    expect(new Set(SERVICE_NAMES).size).toBe(SERVICES.length);
    expect(new Set(SERVICES.map((s) => s.imageEnvKey)).size).toBe(SERVICES.length);
  });
});

describe('env schema vs .env.example', () => {
  // Vars deploy.sh computes, or the shell provides.
  const EXEMPT = new Set(['HOST_PROJECT_DIR', 'HOME']);

  // Plain `.match` with a lookahead rather than `matchAll` — the build
  // targets ES5, where spreading an iterator needs downlevelIteration.
  const exampleKeys = (): string[] =>
    readFileSync(join(ROOT, '.env.example'), 'utf8').match(/^[A-Z][A-Z0-9_]*(?==)/gm) ?? [];

  const composeRefs = (): string[] =>
    (composeSource.match(/\$\{[A-Z][A-Z0-9_]*/g) ?? []).map((r) => r.slice(2));

  it('makes every shipped var editable in Settings', () => {
    const schemaKeys = ENV_SCHEMA.map((d) => d.key);
    // HOST_BIND and HTTPS_ONLY were missing here — the LAN-exposure control
    // and the cookie/HSTS switch, neither reachable from the UI.
    expect(exampleKeys().filter((k) => !schemaKeys.includes(k) && !EXEMPT.has(k))).toEqual([]);
  });

  it('ships every var Settings offers to set', () => {
    const keys = exampleKeys();
    expect(ENV_SCHEMA.map((d) => d.key).filter((k) => !keys.includes(k) && !EXEMPT.has(k)))
      .toEqual([]);
  });

  it('declares every var compose interpolates', () => {
    const keys = exampleKeys();
    const undeclared = composeRefs()
      .filter((v) => !keys.includes(v) && !EXEMPT.has(v))
      .filter((v, i, all) => all.indexOf(v) === i);
    expect(undeclared).toEqual([]);
  });
});

/**
 * The dependency-direction invariant.
 *
 * media-ui is the tool you reach for when the stack is broken, so it must
 * not acquire a hard dependency on any part of the stack it reports on.
 * That has already gone wrong twice: a CIFS volume mounted into media-ui
 * meant a NAS blip stopped the dashboard booting, and HEALTHCHECK pointed
 * at the fan-out /api/health meant one down service marked it unhealthy.
 */
describe('media-ui independence', () => {
  const NETWORK_VOLUME_TYPES = new Set(['cifs', 'nfs', 'nfs4', 'smb3']);

  function assertIndependent(cfg: ComposeConfig) {
    const svc = cfg.services['media-ui'];
    expect(svc, 'media-ui missing from resolved config').toBeDefined();

    const networkBacked = new Set(
      Object.entries(cfg.volumes || {})
        .filter(([, v]) => NETWORK_VOLUME_TYPES.has(v?.driver_opts?.type ?? ''))
        .map(([name]) => name),
    );
    const mounted = (svc.volumes || [])
      .filter((v) => v.type === 'volume' && v.source && networkBacked.has(v.source))
      .map((v) => v.source);
    // A failed network mount stops the container starting outright — there
    // is no "mount if available".
    expect(mounted, 'media-ui mounts a network-backed volume').toEqual([]);

    const hardDeps = Object.entries(svc.depends_on || {})
      .filter(([, d]) => d.condition === 'service_healthy')
      .map(([name]) => name);
    expect(hardDeps, 'media-ui waits on another service being healthy').toEqual([]);
  }

  maybe('holds for the base stack', () => assertIndependent(config));

  maybe('holds with the NAS override the Migration wizard generates', () => {
    // The real generator output, not a reconstruction of it — so a change
    // to generateOverrideYaml is what this actually tests.
    const path = join(workdir, 'nas.yml');
    writeFileSync(path, generateOverrideYaml('smb'));
    assertIndependent(composeConfig([path]));
  });

  it('keeps media-ui out of the NAS mount list', () => {
    expect(NAS_MOUNTED_SERVICES as readonly string[]).not.toContain('media-ui');
  });
});
