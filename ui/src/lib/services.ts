/**
 * The service manifest — one declaration per container in the stack.
 *
 * WHY THIS EXISTS
 *
 * The dashboard used to keep nine separate hardcoded lists of what the stack
 * contains: which services are valid, which share the VPN's network
 * namespace, which appear on the Network page, which have a web UI, where
 * each one's API key lives, and which image each is pinned to. None derived
 * from another, so adding FlareSolverr meant editing sixteen production
 * files — and one of them got missed. NetworkTopology kept its own
 * `VPN_SERVICES` set without it, so the diagram filed FlareSolverr under
 * "uses your regular internet connection" when every byte it sends actually
 * goes through the tunnel.
 *
 * Everything the dashboard knows about a service is declared here once, and
 * the lists are derived below. Adding a service is now: add it to
 * docker-compose.yml, add it here, done.
 *
 * WHAT THIS IS NOT
 *
 * Not a replacement for docker-compose.yml. Compose remains the source of
 * truth for how the stack actually runs — images, ports, volumes, networks.
 * This is the dashboard's *view* of it, and scripts/check-drift.mjs asserts
 * the two agree, so this file cannot quietly fall behind compose.
 *
 * No Node built-ins here: client components import it directly.
 */

export type SourceKind = 'docker-hub' | 'github-releases' | 'ghcr';

export interface UpdateSource {
  kind: SourceKind;
  /** docker-hub: `ns/name`. github-releases: `owner/repo`. ghcr: `owner/image`. */
  repo: string;
  /**
   * Regex a candidate tag must match — filters LinuxServer's noisy tag list
   * (`nightly`, `1.31.2-ls289`, `arm64v8-1.31.2`) down to clean semver.
   */
  tagPattern?: RegExp;
  /**
   * Convert an upstream release tag into the tag the image is published
   * under, where they differ (e.g. `release-5.0.4` -> `5.0.4`).
   */
  tagToImageTag?: (tag: string) => string;
}

export interface WebUi {
  /**
   * The host port to link to when nothing overrides it. The actual port is
   * `portEnvKey` in .env; this is the default that ships in .env.example.
   *
   * Known limitation: the System page links using this default rather than
   * the configured value, so changing a PORT_* in Settings leaves the link
   * pointing at the old port. Recorded here so there is one place to fix it.
   */
  defaultPort: number;
  portEnvKey: string;
  path?: string;
  https?: boolean;
}

export interface ApiKeyLocation {
  envKey: string;
  /**
   * Where the service writes its own key on first boot, which is what
   * deploy.sh and lib/config-keys.ts read to auto-seed .env:
   *   xml  — <ApiKey> in config.xml             (the *arr apps)
   *   yaml — apikey: under auth: in config.yaml (Bazarr)
   *   json — main.apiKey in settings.json       (Seerr)
   *   ini  — api_key= under [misc] in sabnzbd.ini (SABnzbd)
   */
  format: 'xml' | 'yaml' | 'json' | 'ini';
}

export type ServiceGroupLabel =
  | 'VPN Gateway'
  | 'Download Clients'
  | 'Indexer & Media Managers'
  | 'Media Companions'
  | 'Operations'
  | 'Web UI';

export interface ServiceDef {
  /** Compose service name. Also the container_name — they match throughout. */
  name: string;
  /** Display name. */
  label: string;
  group: ServiceGroupLabel;
  description: string;
  /** Extra guidance shown on the System page. */
  tip?: string;
  /** The IMAGE_* var in .env this service's image is pinned to. */
  imageEnvKey: string;
  /** Where to look for newer versions. Omit to leave it out of the Updates tab. */
  update?: UpdateSource;
  /** Present when the service has a browsable UI to link to. */
  webUi?: WebUi;
  /**
   * The service whose network namespace this one shares
   * (`network_mode: "service:<name>"` in compose). Such a service has no
   * network identity of its own: its traffic exits through that service,
   * and it cannot start without it.
   */
  netns?: string;
  /** Include in the Network page's per-container traffic stats. */
  monitored?: boolean;
  /** Where the service's own API key lives, for auto-seeding. */
  apiKey?: ApiKeyLocation;
}

/**
 * Order matters — it drives display order on the System and Logs pages.
 * Grouped by role, following the path a download actually takes: tunnel
 * first, then the clients inside it, then the managers, then everything
 * built on top.
 */
export const SERVICES: ServiceDef[] = [
  {
    name: 'gluetun',
    label: 'Gluetun',
    group: 'VPN Gateway',
    description: 'VPN client — routes all download traffic through WireGuard/OpenVPN',
    imageEnvKey: 'IMAGE_GLUETUN',
    update: { kind: 'docker-hub', repo: 'qmcgaw/gluetun', tagPattern: /^v\d+\.\d+(?:\.\d+)?$/ },
    monitored: true,
  },
  {
    name: 'qbittorrent',
    label: 'qBittorrent',
    group: 'Download Clients',
    description: 'Torrent client — downloads from torrent indexers via VPN',
    tip: 'Default login — username: admin, password: your QBITTORRENT_PASSWORD from Settings. Change the default password after first login.',
    imageEnvKey: 'IMAGE_QBITTORRENT',
    update: { kind: 'docker-hub', repo: 'linuxserver/qbittorrent', tagPattern: /^\d+\.\d+\.\d+$/ },
    webUi: { defaultPort: 8080, portEnvKey: 'PORT_QBITTORRENT' },
    netns: 'gluetun',
    monitored: true,
  },
  {
    name: 'sabnzbd',
    label: 'SABnzbd',
    group: 'Download Clients',
    description: 'Usenet client — downloads from Usenet providers via VPN',
    imageEnvKey: 'IMAGE_SABNZBD',
    update: { kind: 'docker-hub', repo: 'linuxserver/sabnzbd', tagPattern: /^\d+\.\d+\.\d+$/ },
    webUi: { defaultPort: 8081, portEnvKey: 'PORT_SABNZBD' },
    netns: 'gluetun',
    monitored: true,
    apiKey: { envKey: 'SABNZBD_API_KEY', format: 'ini' },
  },
  {
    name: 'prowlarr',
    label: 'Prowlarr',
    group: 'Indexer & Media Managers',
    description: 'Indexer manager — manages torrent and Usenet sources for Sonarr/Radarr',
    imageEnvKey: 'IMAGE_PROWLARR',
    update: { kind: 'docker-hub', repo: 'linuxserver/prowlarr', tagPattern: /^\d+\.\d+\.\d+$/ },
    webUi: { defaultPort: 9696, portEnvKey: 'PORT_PROWLARR' },
    monitored: true,
    apiKey: { envKey: 'PROWLARR_API_KEY', format: 'xml' },
  },
  {
    name: 'flaresolverr',
    label: 'FlareSolverr',
    group: 'Indexer & Media Managers',
    description: 'Cloudflare solver — lets Prowlarr scrape indexers behind CF/DDoS-Guard',
    // No webUi on purpose: FlareSolverr publishes no host port and has
    // nothing browsable, so no "Open UI" link should render for it.
    tip: 'No web UI and no published port by design. Runs inside Gluetun\'s network namespace so challenges are solved from the VPN exit IP. Prowlarr reaches it at http://gluetun:8191.',
    imageEnvKey: 'IMAGE_FLARESOLVERR',
    update: { kind: 'github-releases', repo: 'FlareSolverr/FlareSolverr', tagPattern: /^v\d+\.\d+\.\d+$/ },
    netns: 'gluetun',
    monitored: true,
  },
  {
    name: 'sonarr',
    label: 'Sonarr',
    group: 'Indexer & Media Managers',
    description: 'TV show manager — monitors, downloads, and organises TV episodes',
    imageEnvKey: 'IMAGE_SONARR',
    update: { kind: 'docker-hub', repo: 'linuxserver/sonarr', tagPattern: /^\d+\.\d+\.\d+$/ },
    webUi: { defaultPort: 8989, portEnvKey: 'PORT_SONARR' },
    monitored: true,
    apiKey: { envKey: 'SONARR_API_KEY', format: 'xml' },
  },
  {
    name: 'radarr',
    label: 'Radarr',
    group: 'Indexer & Media Managers',
    description: 'Movie manager — monitors, downloads, and organises movies',
    imageEnvKey: 'IMAGE_RADARR',
    update: { kind: 'docker-hub', repo: 'linuxserver/radarr', tagPattern: /^\d+\.\d+\.\d+$/ },
    webUi: { defaultPort: 7878, portEnvKey: 'PORT_RADARR' },
    monitored: true,
    apiKey: { envKey: 'RADARR_API_KEY', format: 'xml' },
  },
  {
    name: 'unpackerr',
    label: 'Unpackerr',
    group: 'Indexer & Media Managers',
    description: 'Archive extractor — unpacks completed downloads for import',
    imageEnvKey: 'IMAGE_UNPACKERR',
    update: { kind: 'docker-hub', repo: 'golift/unpackerr', tagPattern: /^\d+\.\d+\.\d+$/ },
  },
  {
    name: 'bazarr',
    label: 'Bazarr',
    group: 'Media Companions',
    description: 'Subtitle manager — finds and downloads subtitles automatically',
    imageEnvKey: 'IMAGE_BAZARR',
    update: { kind: 'docker-hub', repo: 'linuxserver/bazarr', tagPattern: /^\d+\.\d+\.\d+$/ },
    webUi: { defaultPort: 6767, portEnvKey: 'PORT_BAZARR' },
    monitored: true,
    apiKey: { envKey: 'BAZARR_API_KEY', format: 'yaml' },
  },
  {
    name: 'seerr',
    label: 'Seerr',
    group: 'Media Companions',
    description: 'Request manager — lets users browse and request media',
    imageEnvKey: 'IMAGE_SEERR',
    update: { kind: 'github-releases', repo: 'seerr-team/seerr', tagPattern: /^v?\d+\.\d+\.\d+$/ },
    webUi: { defaultPort: 5055, portEnvKey: 'PORT_SEERR' },
    apiKey: { envKey: 'SEERR_API_KEY', format: 'json' },
  },
  {
    name: 'recyclarr',
    label: 'Recyclarr',
    group: 'Operations',
    description: 'Quality sync — keeps quality profiles aligned with TRaSH Guides',
    imageEnvKey: 'IMAGE_RECYCLARR',
    update: { kind: 'github-releases', repo: 'recyclarr/recyclarr', tagPattern: /^\d+\.\d+\.\d+$/ },
  },
  {
    name: 'watchtower',
    label: 'Watchtower',
    group: 'Operations',
    description: 'Auto-updater — checks for and applies Docker image updates',
    imageEnvKey: 'IMAGE_WATCHTOWER',
    update: { kind: 'docker-hub', repo: 'containrrr/watchtower', tagPattern: /^\d+\.\d+\.\d+$/ },
  },
  {
    name: 'media-ui',
    label: 'Mars Media Centre',
    group: 'Web UI',
    description: 'Unified dashboard — this web interface',
    imageEnvKey: 'IMAGE_MEDIA_UI',
    // Built by our own CI and published to GHCR, so read the registry's tag
    // list directly. Only vX.Y.Z is offered — `edge` and `sha-…` exist but
    // are opt-in via .env, not something to suggest as an update.
    update: { kind: 'ghcr', repo: 'marioalfaro75/mmc-media-ui', tagPattern: /^v\d+\.\d+\.\d+$/ },
    // No webUi entry: this *is* the web UI, so there is nothing to link to.
    monitored: true,
  },
];

/* ------------------------------------------------------------------ */
/* Derived views                                                        */
/* ------------------------------------------------------------------ */

export const SERVICE_NAMES: string[] = SERVICES.map((s) => s.name);

/** Membership test for anything that takes a service name from a request. */
export const VALID_SERVICES: ReadonlySet<string> = new Set(SERVICE_NAMES);

export function getService(name: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.name === name);
}

/**
 * Services sharing another service's network namespace. They have no network
 * identity of their own and cannot start without their host — so a VPN
 * settings change recreates them, and the Network page must show them inside
 * the tunnel rather than on the bridge.
 */
export const NETNS_SERVICES: string[] = SERVICES.filter((s) => s.netns).map((s) => s.name);

/** The netns members plus the gateway itself — everything a VPN change touches. */
export const VPN_SERVICES: string[] = [
  ...new Set(SERVICES.filter((s) => s.netns).map((s) => s.netns as string)),
  ...NETNS_SERVICES,
];

export const MONITORED_SERVICES: string[] = SERVICES.filter((s) => s.monitored).map((s) => s.name);

export interface ServiceGroup {
  label: ServiceGroupLabel;
  services: string[];
}

/** Grouped in manifest order, for the System page. */
export const SERVICE_GROUPS: ServiceGroup[] = SERVICES.reduce<ServiceGroup[]>((groups, svc) => {
  const existing = groups.find((g) => g.label === svc.group);
  if (existing) existing.services.push(svc.name);
  else groups.push({ label: svc.group, services: [svc.name] });
  return groups;
}, []);

/** Keyed by IMAGE_* var, the shape the Updates tab consumes. */
export const APP_UPDATE_SOURCES: Record<string, UpdateSource> = Object.fromEntries(
  SERVICES.filter((s) => s.update).map((s) => [s.imageEnvKey, s.update as UpdateSource]),
);

/** Reverse lookup: which service an IMAGE_* var pins. */
export const SERVICE_BY_IMAGE_KEY: Record<string, ServiceDef> = Object.fromEntries(
  SERVICES.map((s) => [s.imageEnvKey, s]),
);

/** Services whose API key can be auto-seeded, by config format. */
export function servicesWithApiKeyFormat(format: ApiKeyLocation['format']): ServiceDef[] {
  return SERVICES.filter((s) => s.apiKey?.format === format);
}
