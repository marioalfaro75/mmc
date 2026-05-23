import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);

const PROJECT_DIR = process.env.HOST_PROJECT_DIR || '';

// Optional override files that get chained into every compose command when present.
// Order matters: later files override earlier ones.
const OVERRIDE_FILES = ['docker-compose.nas.override.yml'];

function composeFileArgs(): string[] {
  const args = ['-f', `${PROJECT_DIR}/docker-compose.yml`];
  for (const name of OVERRIDE_FILES) {
    if (existsSync(`${PROJECT_DIR}/${name}`)) {
      args.push('-f', `${PROJECT_DIR}/${name}`);
    }
  }
  return args;
}

function composeArgs(): string[] {
  if (!PROJECT_DIR) throw new Error('HOST_PROJECT_DIR is not set');
  return [
    'compose',
    ...composeFileArgs(),
    '--project-directory', PROJECT_DIR,
    '--env-file', `${PROJECT_DIR}/.env`,
  ];
}

export const VALID_SERVICES = new Set([
  'gluetun',
  'qbittorrent',
  'sabnzbd',
  'unpackerr',
  'prowlarr',
  'sonarr',
  'radarr',
  'bazarr',
  'seerr',
  'recyclarr',
  'watchtower',
  'media-ui',
]);

// Services that share gluetun's network — cannot run without gluetun
const VPN_DEPENDENT_SERVICES = ['qbittorrent', 'sabnzbd'];

export interface DockerServiceStatus {
  name: string;
  service: string;
  state: string;
  health: string;
  status: string; // e.g. "Up 3 hours (healthy)"
  image: string;
}

export async function listServices(): Promise<DockerServiceStatus[]> {
  const args = [...composeArgs(), 'ps', '--format', 'json', '-a'];
  const { stdout } = await execFileAsync('docker', args, { timeout: 15000 });

  if (!stdout.trim()) return [];

  // docker compose ps --format json outputs one JSON object per line
  const lines = stdout.trim().split('\n');
  const all = lines.map((line) => {
    const raw = JSON.parse(line);
    return {
      name: raw.Name || raw.name || '',
      service: raw.Service || raw.service || '',
      state: raw.State || raw.state || 'unknown',
      health: raw.Health || raw.health || 'none',
      status: raw.Status || raw.status || '',
      image: raw.Image || raw.image || '',
    };
  });

  // Deduplicate by service name — after a recreate, both the old (exited)
  // and new (running) container can appear.  Prefer the running one.
  const byService = new Map<string, DockerServiceStatus>();
  for (const svc of all) {
    const existing = byService.get(svc.service);
    if (!existing || (existing.state !== 'running' && svc.state === 'running')) {
      byService.set(svc.service, svc);
    }
  }
  return Array.from(byService.values());
}

async function getServiceState(service: string): Promise<DockerServiceStatus | undefined> {
  try {
    const statuses = await listServices();
    return statuses.find((s) => s.service === service);
  } catch {
    return undefined;
  }
}

function isRunning(svc: DockerServiceStatus | undefined): boolean {
  return svc?.state === 'running';
}

function isHealthy(svc: DockerServiceStatus | undefined): boolean {
  if (!svc || svc.state !== 'running') return false;
  return svc.health === 'healthy' || svc.health === 'none';
}

async function waitForRunning(service: string, timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isRunning(await getServiceState(service))) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function waitForHealthy(service: string, timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isHealthy(await getServiceState(service))) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function waitForStopped(service: string, timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const svc = await getServiceState(service);
    if (!svc || svc.state === 'exited') return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function requireGluetun(name: string): boolean {
  return VPN_DEPENDENT_SERVICES.includes(name);
}

async function assertGluetunRunning(name: string): Promise<void> {
  if (!requireGluetun(name)) return;
  const gluetun = await getServiceState('gluetun');
  if (!isRunning(gluetun)) {
    throw new Error(`Cannot ${name} — gluetun is not running. Start gluetun first.`);
  }
}

export async function restartService(name: string): Promise<void> {
  const current = await getServiceState(name);

  // If the service isn't running, start it instead of restarting
  if (!current || current.state !== 'running') {
    await startService(name);
    return;
  }

  await assertGluetunRunning(name);

  const args = [...composeArgs(), 'restart', '-t', '30', name];
  await execFileAsync('docker', args, { timeout: 120000 });

  const cameUp = await waitForRunning(name, 30000);
  if (!cameUp) {
    throw new Error(`${name} did not come back up after restart`);
  }
}

export async function stopService(name: string): Promise<void> {
  const current = await getServiceState(name);

  // Already stopped — nothing to do
  if (!current || current.state === 'exited') return;

  // Stopping gluetun — stop VPN-dependent services first (they'll lose network anyway)
  if (name === 'gluetun') {
    for (const dep of VPN_DEPENDENT_SERVICES) {
      const depState = await getServiceState(dep);
      if (isRunning(depState)) {
        const depArgs = [...composeArgs(), 'stop', '-t', '30', dep];
        await execFileAsync('docker', depArgs, { timeout: 60000 });
      }
    }
  }

  const args = [...composeArgs(), 'stop', '-t', '30', name];
  await execFileAsync('docker', args, { timeout: 60000 });

  const stopped = await waitForStopped(name, 30000);
  if (!stopped) {
    throw new Error(`${name} did not stop within 30 seconds`);
  }
}

export async function startService(name: string): Promise<void> {
  const current = await getServiceState(name);

  // Already running — nothing to do
  if (isRunning(current)) return;

  await assertGluetunRunning(name);

  // Use 'up -d' instead of 'start' — works for both stopped and removed containers
  const args = [...composeArgs(), 'up', '-d', '--no-deps', name];
  await execFileAsync('docker', args, { timeout: 120000 });

  const cameUp = await waitForRunning(name, 30000);
  if (!cameUp) {
    throw new Error(`${name} did not start successfully`);
  }
}

export async function recreateServices(services: string[]): Promise<void> {
  const args = [...composeArgs(), 'up', '-d', '--force-recreate', ...services];
  await execFileAsync('docker', args, { timeout: 180000 });
}

export async function getServiceLogs(name: string, lines = 100): Promise<string> {
  const args = [...composeArgs(), 'logs', '--tail', String(lines), '--no-color', name];
  const { stdout } = await execFileAsync('docker', args, { timeout: 15000 });
  return stdout;
}

export function selfStop(): void {
  if (!PROJECT_DIR || !/^\/[\w./-]+$/.test(PROJECT_DIR)) {
    throw new Error('Invalid or missing HOST_PROJECT_DIR');
  }

  // Use a helper container to stop media-ui from outside
  const args = [
    'run', '--rm', '-d',
    '--name', 'mmc-self-stop',
    '-v', '/var/run/docker.sock:/var/run/docker.sock',
    '-v', `${PROJECT_DIR}:${PROJECT_DIR}:ro`,
    'docker:cli',
    'docker', 'compose',
    ...composeFileArgs(),
    '--project-directory', PROJECT_DIR,
    '--env-file', `${PROJECT_DIR}/.env`,
    'stop', '-t', '30', 'media-ui',
  ];
  const child = execFile('docker', args, { timeout: 30000 }, () => {});
  child.unref();
}

export function selfRestart(): void {
  if (!PROJECT_DIR || !/^\/[\w./-]+$/.test(PROJECT_DIR)) {
    throw new Error('Invalid or missing HOST_PROJECT_DIR');
  }

  // To pick up new env vars or volume mounts, we need
  // `docker compose up -d --force-recreate media-ui`.
  // But that command kills this container mid-execution.
  // Solution: run the compose command from a short-lived helper container that
  // shares the Docker socket and project directory. This container survives
  // the media-ui restart because it's a separate container.
  const args = [
    'run', '--rm', '-d',
    '--name', 'mmc-self-restart',
    '-v', '/var/run/docker.sock:/var/run/docker.sock',
    '-v', `${PROJECT_DIR}:${PROJECT_DIR}:ro`,
    'docker:cli',
    'docker', 'compose',
    ...composeFileArgs(),
    '--project-directory', PROJECT_DIR,
    '--env-file', `${PROJECT_DIR}/.env`,
    'up', '-d', '--force-recreate', 'media-ui',
  ];
  const child = execFile('docker', args, { timeout: 30000 }, () => {});
  child.unref();
}

export interface TunnelInterfaceStats {
  interface: string;
  rxBytes: number;
  txBytes: number;
}

export async function getTunnelStats(): Promise<TunnelInterfaceStats | null> {
  try {
    const { stdout } = await execFileAsync(
      'docker', ['exec', 'gluetun', 'cat', '/proc/net/dev'],
      { timeout: 5000 }
    );
    // /proc/net/dev format:
    // Inter-|   Receive                                                |  Transmit
    //  face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets ...
    //   tun0: 123456  789  0  0  0  0  0  0  654321  456  0  0  0  0  0  0
    for (const line of stdout.split('\n')) {
      const match = line.match(/^\s*(tun\d+|wg\d+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
      if (match) {
        return {
          interface: match[1],
          rxBytes: parseInt(match[2], 10),
          txBytes: parseInt(match[3], 10),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface ContainerNetIO {
  name: string;
  rx: string;
  tx: string;
}

export async function getContainerNetworkStats(containers: string[]): Promise<ContainerNetIO[]> {
  const results: ContainerNetIO[] = [];
  try {
    const { stdout } = await execFileAsync(
      'docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.NetIO}}', ...containers],
      { timeout: 10000 }
    );
    for (const line of stdout.trim().split('\n')) {
      if (!line.trim()) continue;
      const [name, netIO] = line.split('\t');
      if (!name || !netIO) continue;
      // NetIO format: "1.2GB / 345MB"
      const parts = netIO.split(' / ');
      results.push({
        name: name.trim(),
        rx: parts[0]?.trim() || '0B',
        tx: parts[1]?.trim() || '0B',
      });
    }
  } catch { /* container might not be running */ }
  return results;
}

export async function restartServicesStaged(services: string[]): Promise<void> {
  // If media-ui is being restarted, do it last and fire-and-forget (it kills itself)
  const hasSelf = services.includes('media-ui');
  const hasGluetun = services.includes('gluetun');
  const remaining = services.filter((s) => s !== 'gluetun' && s !== 'media-ui');

  if (hasGluetun) {
    // Stop VPN-dependent services before recreating gluetun
    for (const dep of VPN_DEPENDENT_SERVICES) {
      const depState = await getServiceState(dep);
      if (isRunning(depState)) {
        const depArgs = [...composeArgs(), 'stop', '-t', '30', dep];
        await execFileAsync('docker', depArgs, { timeout: 60000 });
      }
    }

    // Add VPN-dependent services to restart list if not already included
    for (const dep of VPN_DEPENDENT_SERVICES) {
      if (!remaining.includes(dep)) remaining.push(dep);
    }

    await recreateServices(['gluetun']);
    const gluetunUp = await waitForHealthy('gluetun', 60000);
    if (!gluetunUp) {
      throw new Error('gluetun did not become healthy after restart');
    }

    // Now restart VPN-dependent services first, then the rest
    const vpnDeps = remaining.filter((s) => VPN_DEPENDENT_SERVICES.includes(s));
    const others = remaining.filter((s) => !VPN_DEPENDENT_SERVICES.includes(s));

    if (vpnDeps.length > 0) await recreateServices(vpnDeps);
    if (others.length > 0) await recreateServices(others);
  } else {
    if (remaining.length > 0) await recreateServices(remaining);
  }

  // Self-restart via Docker Engine API — the daemon restarts the container
  // from outside, so it survives even though our process gets killed
  if (hasSelf) {
    selfRestart();
  }
}
