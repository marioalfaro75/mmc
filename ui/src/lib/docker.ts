import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const PROJECT_DIR = process.env.HOST_PROJECT_DIR || '';

function composeArgs(): string[] {
  if (!PROJECT_DIR) throw new Error('HOST_PROJECT_DIR is not set');
  return [
    'compose',
    '-f', `${PROJECT_DIR}/docker-compose.yml`,
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
  'tautulli',
  'seerr',
  'recyclarr',
  'watchtower',
  'media-ui',
]);

// Services that share gluetun's network and must restart when gluetun restarts
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
  return lines.map((line) => {
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
}

export async function restartService(name: string): Promise<void> {
  const args = [...composeArgs(), 'restart', name];
  await execFileAsync('docker', args, { timeout: 120000 });
}

export async function stopService(name: string): Promise<void> {
  const args = [...composeArgs(), 'stop', name];
  await execFileAsync('docker', args, { timeout: 60000 });
}

export async function startService(name: string): Promise<void> {
  const args = [...composeArgs(), 'start', name];
  await execFileAsync('docker', args, { timeout: 120000 });
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

async function waitForHealthy(service: string, timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const statuses = await listServices();
      const svc = statuses.find((s) => s.service === service);
      if (svc && svc.state === 'running' && svc.health === 'healthy') return true;
    } catch {
      // ignore during restart
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

export async function restartServicesStaged(services: string[]): Promise<void> {
  // If gluetun is being restarted, do it first and wait for healthy
  const hasGluetun = services.includes('gluetun');
  const remaining = services.filter((s) => s !== 'gluetun');

  if (hasGluetun) {
    // Add VPN-dependent services if not already included
    for (const dep of VPN_DEPENDENT_SERVICES) {
      if (!remaining.includes(dep)) remaining.push(dep);
    }

    await recreateServices(['gluetun']);
    await waitForHealthy('gluetun', 60000);

    // Now restart VPN-dependent services first, then the rest
    const vpnDeps = remaining.filter((s) => VPN_DEPENDENT_SERVICES.includes(s));
    const others = remaining.filter((s) => !VPN_DEPENDENT_SERVICES.includes(s));

    if (vpnDeps.length > 0) await recreateServices(vpnDeps);
    if (others.length > 0) await recreateServices(others);
  } else {
    if (remaining.length > 0) await recreateServices(remaining);
  }
}
