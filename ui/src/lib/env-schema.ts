export type EnvVarType = 'string' | 'path' | 'port' | 'integer' | 'boolean' | 'select' | 'secret' | 'cron';
export type EnvGroup = 'general' | 'vpn' | 'network' | 'services' | 'images';

export interface EnvVarDef {
  key: string;
  label: string;
  type: EnvVarType;
  group: EnvGroup;
  description: string;
  sensitive?: boolean;
  required?: boolean;
  default?: string;
  options?: string[];
  affectsServices: string[];
  servicePort?: number;
}

const ALL_SERVICES = [
  'gluetun', 'qbittorrent', 'sabnzbd', 'unpackerr', 'prowlarr',
  'sonarr', 'radarr', 'bazarr', 'seerr',
  'recyclarr', 'watchtower', 'media-ui',
];

const VPN_SERVICES = ['gluetun', 'qbittorrent', 'sabnzbd'];

export const ENV_SCHEMA: EnvVarDef[] = [
  // --- General ---
  { key: 'TZ', label: 'Timezone', type: 'string', group: 'general', description: 'IANA timezone (e.g. Australia/Sydney)', default: 'Australia/Sydney', affectsServices: ALL_SERVICES },
  { key: 'PUID', label: 'User ID', type: 'integer', group: 'general', description: 'User ID for file ownership (run `id` to find yours)', default: '1000', affectsServices: ALL_SERVICES },
  { key: 'PGID', label: 'Group ID', type: 'integer', group: 'general', description: 'Group ID for file ownership', default: '1000', affectsServices: ALL_SERVICES },
  { key: 'UMASK', label: 'Umask', type: 'string', group: 'general', description: 'File permission mask', default: '002', affectsServices: ALL_SERVICES },
  { key: 'DATA_ROOT', label: 'Data Root', type: 'path', group: 'general', description: 'Root path for all media and downloads', required: true, default: '~/.mmc/data', affectsServices: ALL_SERVICES },
  { key: 'CONFIG_ROOT', label: 'Config Root', type: 'path', group: 'general', description: 'Root path for container configs', required: true, default: '~/.mmc/config', affectsServices: ALL_SERVICES },
  { key: 'BACKUP_DIR', label: 'Backup Directory', type: 'path', group: 'general', description: 'Where backup.sh stores archives', required: true, default: '~/.mmc/backups', affectsServices: [] },
  { key: 'LOG_LEVEL', label: 'Log Level', type: 'select', group: 'general', description: 'Application log verbosity', default: 'info', options: ['debug', 'info', 'warn', 'error'], affectsServices: ['media-ui'] },
  { key: 'MMC_API_KEY', label: 'API Key', type: 'secret', group: 'general', description: 'Optional API key to require authentication for the web UI (leave blank to disable)', sensitive: true, affectsServices: ['media-ui'] },
  { key: 'GLUETUN_CONTROL_PASSWORD', label: 'Gluetun Control Password', type: 'secret', group: 'general', description: 'Password for the Gluetun VPN control API (basic auth)', sensitive: true, default: 'changeme', affectsServices: ['gluetun'] },

  // --- VPN ---
  { key: 'VPN_SERVICE_PROVIDER', label: 'VPN Provider', type: 'select', group: 'vpn', description: 'VPN service provider', required: true, options: ['protonvpn', 'mullvad', 'airvpn', 'nordvpn', 'surfshark', 'expressvpn', 'windscribe', 'privado', 'custom'], affectsServices: VPN_SERVICES },
  { key: 'VPN_TYPE', label: 'VPN Type', type: 'select', group: 'vpn', description: 'VPN protocol', required: true, options: ['wireguard', 'openvpn'], default: 'wireguard', affectsServices: VPN_SERVICES },
  { key: 'WIREGUARD_PRIVATE_KEY', label: 'WireGuard Private Key', type: 'secret', group: 'vpn', description: 'Your WireGuard private key', sensitive: true, required: true, affectsServices: VPN_SERVICES },
  { key: 'WIREGUARD_ADDRESSES', label: 'WireGuard Address', type: 'string', group: 'vpn', description: 'Your WireGuard address (e.g. 10.2.0.2/32)', required: true, affectsServices: VPN_SERVICES },
  { key: 'WIREGUARD_PRESHARED_KEY', label: 'WireGuard Preshared Key', type: 'secret', group: 'vpn', description: 'Optional preshared key', sensitive: true, affectsServices: VPN_SERVICES },
  { key: 'SERVER_COUNTRIES', label: 'Server Country', type: 'string', group: 'vpn', description: 'VPN server country (e.g. Netherlands)', affectsServices: VPN_SERVICES },
  { key: 'SECURE_CORE_ONLY', label: 'Secure Core', type: 'select', group: 'vpn', description: 'Route through privacy-friendly entry countries before exiting (ProtonVPN only)', options: ['on', 'off'], default: 'off', affectsServices: VPN_SERVICES },
  { key: 'SERVER_HOSTNAMES', label: 'Server Hostname', type: 'string', group: 'vpn', description: 'Entry-exit hostname, e.g. is-au-01.protonvpn.com (Iceland → Australia), ch-us-01a.protonvpn.com (Switzerland → US)', affectsServices: VPN_SERVICES },
  { key: 'VPN_PORT_FORWARDING', label: 'Port Forwarding', type: 'select', group: 'vpn', description: 'Enable VPN port forwarding', options: ['on', 'off'], default: 'on', affectsServices: VPN_SERVICES },
  { key: 'FIREWALL_VPN_INPUT_PORTS', label: 'Forwarded Port', type: 'string', group: 'vpn', description: 'Forwarded port number (if known)', affectsServices: VPN_SERVICES },

  // --- Network ---
  { key: 'DOCKER_SUBNET', label: 'Docker Subnet', type: 'string', group: 'network', description: 'Docker subnet for inter-container communication', default: '172.28.0.0/24', affectsServices: ALL_SERVICES },
  { key: 'LOCAL_SUBNET', label: 'Local Subnet', type: 'string', group: 'network', description: 'Your home LAN subnet', default: '192.168.1.0/24', affectsServices: VPN_SERVICES },
  { key: 'PORT_SONARR', label: 'Sonarr Port', type: 'port', group: 'network', description: 'Sonarr web UI port', default: '8989', affectsServices: ['sonarr'] },
  { key: 'PORT_RADARR', label: 'Radarr Port', type: 'port', group: 'network', description: 'Radarr web UI port', default: '7878', affectsServices: ['radarr'] },
  { key: 'PORT_PROWLARR', label: 'Prowlarr Port', type: 'port', group: 'network', description: 'Prowlarr web UI port', default: '9696', affectsServices: ['prowlarr'] },
  { key: 'PORT_QBITTORRENT', label: 'qBittorrent Port', type: 'port', group: 'network', description: 'qBittorrent web UI port', default: '8080', affectsServices: ['gluetun'] },
  { key: 'PORT_SABNZBD', label: 'SABnzbd Port', type: 'port', group: 'network', description: 'SABnzbd web UI port', default: '8081', affectsServices: ['gluetun'] },
  { key: 'PORT_SEERR', label: 'Seerr Port', type: 'port', group: 'network', description: 'Seerr web UI port', default: '5055', affectsServices: ['seerr'] },
  { key: 'PORT_BAZARR', label: 'Bazarr Port', type: 'port', group: 'network', description: 'Bazarr web UI port', default: '6767', affectsServices: ['bazarr'] },
  { key: 'PORT_GLUETUN_CONTROL', label: 'Gluetun Control Port', type: 'port', group: 'network', description: 'Gluetun HTTP control port', default: '8000', affectsServices: ['gluetun'] },
  { key: 'PORT_UI', label: 'Web UI Port', type: 'port', group: 'network', description: 'Unified web UI port', default: '3000', affectsServices: ['media-ui'] },

  // --- Services ---
  { key: 'SONARR_API_KEY', label: 'Sonarr API Key', type: 'secret', group: 'services', description: 'API key from Sonarr → Settings → General', sensitive: true, affectsServices: ['media-ui'], servicePort: 8989 },
  { key: 'RADARR_API_KEY', label: 'Radarr API Key', type: 'secret', group: 'services', description: 'API key from Radarr → Settings → General', sensitive: true, affectsServices: ['media-ui'], servicePort: 7878 },
  { key: 'PROWLARR_API_KEY', label: 'Prowlarr API Key', type: 'secret', group: 'services', description: 'API key from Prowlarr → Settings → General', sensitive: true, affectsServices: ['media-ui'], servicePort: 9696 },
  { key: 'QBITTORRENT_PASSWORD', label: 'qBittorrent Password', type: 'secret', group: 'services', description: 'qBittorrent web UI password', sensitive: true, affectsServices: ['media-ui'], servicePort: 8080 },
  { key: 'SABNZBD_API_KEY', label: 'SABnzbd API Key', type: 'secret', group: 'services', description: 'API key from SABnzbd → Config → General', sensitive: true, affectsServices: ['media-ui'], servicePort: 8081 },
  { key: 'SEERR_API_KEY', label: 'Seerr API Key', type: 'secret', group: 'services', description: 'API key from Seerr → Settings → General', sensitive: true, affectsServices: ['media-ui'], servicePort: 5055 },
  { key: 'BAZARR_API_KEY', label: 'Bazarr API Key', type: 'secret', group: 'services', description: 'API key from Bazarr → Settings → General', sensitive: true, affectsServices: ['media-ui'], servicePort: 6767 },
  { key: 'TMDB_API_KEY', label: 'TMDB API Key', type: 'secret', group: 'services', description: 'Free API key from themoviedb.org — enables searching for movies and TV shows by actor name', sensitive: true, affectsServices: ['media-ui'] },
  { key: 'PLEX_URL', label: 'Plex URL', type: 'string', group: 'services', description: 'Plex server URL (e.g. http://192.168.1.x:32400)', default: 'http://localhost:32400', affectsServices: ['media-ui'] },
  { key: 'UN_SONARR_0_API_KEY', label: 'Unpackerr Sonarr Key', type: 'secret', group: 'services', description: 'Sonarr API key for Unpackerr (auto-populated by Detect API Keys)', sensitive: true, affectsServices: ['unpackerr'] },
  { key: 'UN_RADARR_0_API_KEY', label: 'Unpackerr Radarr Key', type: 'secret', group: 'services', description: 'Radarr API key for Unpackerr (auto-populated by Detect API Keys)', sensitive: true, affectsServices: ['unpackerr'] },
  { key: 'WATCHTOWER_SCHEDULE', label: 'Update Schedule', type: 'cron', group: 'services', description: 'Cron expression for Watchtower update checks', default: '0 0 4 * * *', affectsServices: ['watchtower'] },
  { key: 'WATCHTOWER_NOTIFICATIONS', label: 'Notification URL', type: 'string', group: 'services', description: 'Shoutrrr URL for Watchtower notifications (Discord, Slack, Email)', affectsServices: ['watchtower'] },

  // --- Images ---
  { key: 'IMAGE_SONARR', label: 'Sonarr Image', type: 'string', group: 'images', description: 'Docker image for Sonarr', default: 'lscr.io/linuxserver/sonarr:4.0.14', affectsServices: ['sonarr'] },
  { key: 'IMAGE_RADARR', label: 'Radarr Image', type: 'string', group: 'images', description: 'Docker image for Radarr', default: 'lscr.io/linuxserver/radarr:5.21.1', affectsServices: ['radarr'] },
  { key: 'IMAGE_PROWLARR', label: 'Prowlarr Image', type: 'string', group: 'images', description: 'Docker image for Prowlarr', default: 'lscr.io/linuxserver/prowlarr:1.31.2', affectsServices: ['prowlarr'] },
  { key: 'IMAGE_QBITTORRENT', label: 'qBittorrent Image', type: 'string', group: 'images', description: 'Docker image for qBittorrent', default: 'lscr.io/linuxserver/qbittorrent:5.0.4', affectsServices: ['qbittorrent'] },
  { key: 'IMAGE_SABNZBD', label: 'SABnzbd Image', type: 'string', group: 'images', description: 'Docker image for SABnzbd', default: 'lscr.io/linuxserver/sabnzbd:4.4.1', affectsServices: ['sabnzbd'] },
  { key: 'IMAGE_SEERR', label: 'Seerr Image', type: 'string', group: 'images', description: 'Docker image for Seerr', default: 'ghcr.io/seerr-team/seerr:2.3.0', affectsServices: ['seerr'] },
  { key: 'IMAGE_BAZARR', label: 'Bazarr Image', type: 'string', group: 'images', description: 'Docker image for Bazarr', default: 'lscr.io/linuxserver/bazarr:1.5.1', affectsServices: ['bazarr'] },
  { key: 'IMAGE_GLUETUN', label: 'Gluetun Image', type: 'string', group: 'images', description: 'Docker image for Gluetun', default: 'qmcgaw/gluetun:v3.40', affectsServices: ['gluetun'] },
  { key: 'IMAGE_RECYCLARR', label: 'Recyclarr Image', type: 'string', group: 'images', description: 'Docker image for Recyclarr', default: 'ghcr.io/recyclarr/recyclarr:7.4.0', affectsServices: ['recyclarr'] },
  { key: 'IMAGE_UNPACKERR', label: 'Unpackerr Image', type: 'string', group: 'images', description: 'Docker image for Unpackerr', default: 'golift/unpackerr:0.14.5', affectsServices: ['unpackerr'] },
  { key: 'IMAGE_WATCHTOWER', label: 'Watchtower Image', type: 'string', group: 'images', description: 'Docker image for Watchtower', default: 'containrrr/watchtower:1.7.1', affectsServices: ['watchtower'] },
];

const MASKED_VALUE = '••••••••';

export function getSensitiveKeys(): Set<string> {
  return new Set(ENV_SCHEMA.filter((v) => v.sensitive).map((v) => v.key));
}

export function maskSensitiveValues(vars: Record<string, string>): Record<string, string> {
  const sensitive = getSensitiveKeys();
  const masked = { ...vars };
  sensitive.forEach((key) => {
    if (masked[key]) masked[key] = MASKED_VALUE;
  });
  return masked;
}

export function isMaskedValue(value: string): boolean {
  return value === MASKED_VALUE;
}

export function validateEnvVar(key: string, value: string): string | null {
  const def = ENV_SCHEMA.find((v) => v.key === key);
  if (!def) return null; // unknown keys pass through

  if (def.required && !value) return `${def.label} is required`;

  if (!value) return null; // optional empty is fine

  switch (def.type) {
    case 'path':
      if (!value.startsWith('/') && !value.startsWith('~')) return 'Must be an absolute path (start with / or ~)';
      if (value.includes('..')) return 'Must not contain ".."';
      break;
    case 'port': {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) return 'Must be a valid port (1-65535)';
      break;
    }
    case 'integer': {
      if (isNaN(parseInt(value, 10))) return 'Must be a number';
      break;
    }
    case 'select':
      if (def.options && !def.options.includes(value)) return `Must be one of: ${def.options.join(', ')}`;
      break;
  }

  return null;
}

export function validateEnvVars(vars: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    const error = validateEnvVar(key, value);
    if (error) errors[key] = error;
  }

  // Cross-field: Secure Core requires a server hostname
  if (vars['SECURE_CORE_ONLY'] === 'on' && !vars['SERVER_HOSTNAMES']) {
    errors['SERVER_HOSTNAMES'] = 'Server Hostname is required when Secure Core is enabled';
  }

  return errors;
}

export function getAffectedServices(changedKeys: string[]): string[] {
  const services = new Set<string>();
  for (const key of changedKeys) {
    const def = ENV_SCHEMA.find((v) => v.key === key);
    if (def) {
      for (const s of def.affectsServices) services.add(s);
    }
  }
  return Array.from(services);
}

export function getSchemaByGroup(group: EnvGroup): EnvVarDef[] {
  return ENV_SCHEMA.filter((v) => v.group === group);
}
