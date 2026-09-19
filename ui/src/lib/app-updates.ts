// Per-app image update checks.
//
// Read what's *actually in the registry*, not what upstream tagged on GitHub.
//
// Our first cut queried each project's GitHub releases. That broke when
// upstream tagged a develop build as the latest release — e.g. Prowlarr's
// /releases/latest momentarily returned `v2.4.0.5397`, a tag the linuxserver
// image stream doesn't carry, so `docker pull lscr.io/...:v2.4.0.5397`
// failed.
//
// Pulling from the registry side means we surface only tags the user could
// actually pull right now. For LSIO images we query Docker Hub (linuxserver
// also publishes there) and filter to clean semver tags, skipping
// `nightly`/`develop`/`1.31.2-ls289`/`arm64v8-1.31.2` variants. For
// first-party images (gluetun, recyclarr, etc.) the GitHub release tag IS
// the image tag, so the old path stays.

import { readEnv } from './env';
import { ENV_SCHEMA } from './env-schema';
import { APP_UPDATE_SOURCES, SERVICE_BY_IMAGE_KEY } from './services';
import type { SourceKind, UpdateSource } from './services';

/**
 * Update sources now live in the service manifest, alongside everything else
 * a service declares — see lib/services.ts. Re-exported here so existing
 * importers (and the Updates tab) keep working unchanged.
 */
export { APP_UPDATE_SOURCES };
export type { SourceKind };
export type AppUpdateSource = UpdateSource;

export interface AppVersionInfo {
  key: string;            // 'IMAGE_PROWLARR'
  label: string;          // 'Prowlarr'
  service: string;        // 'prowlarr' — compose service name
  image: string;          // 'lscr.io/linuxserver/prowlarr'
  currentTag: string;     // '1.31.2'
  latestTag: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  sourceRepo: string;
  error?: string;
}

export interface AppUpdatesPayload {
  apps: AppVersionInfo[];
  checkedAt: string;
}

/**
 * Split `registry/image:tag` into its image and tag halves.
 *
 * The tag is whatever follows the last `:` — but only when that colon comes
 * after the last `/` (otherwise it's a port number in the registry host).
 */
export function parseImageRef(ref: string): { image: string; tag: string } {
  const lastSlash = ref.lastIndexOf('/');
  const lastColon = ref.lastIndexOf(':');
  if (lastColon > lastSlash) {
    return { image: ref.slice(0, lastColon), tag: ref.slice(lastColon + 1) };
  }
  return { image: ref, tag: 'latest' };
}

function stripV(tag: string): string {
  return tag.startsWith('v') || tag.startsWith('V') ? tag.slice(1) : tag;
}

/**
 * Compare two semver-ish tags. Returns true if `latest` is strictly newer
 * than `current`. Handles missing/extra parts (1.2 vs 1.2.0) and falls
 * back to lexical comparison for non-numeric segments.
 */
export function isNewer(latest: string, current: string): boolean {
  if (latest === current) return false;
  const a = stripV(latest).split(/[.-]/);
  const b = stripV(current).split(/[.-]/);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? '0';
    const bv = b[i] ?? '0';
    const an = Number(av);
    const bn = Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn) && av.match(/^\d+$/) && bv.match(/^\d+$/)) {
      if (an > bn) return true;
      if (an < bn) return false;
      continue;
    }
    if (av !== bv) {
      if (av.match(/^\d+$/) && !bv.match(/^\d+$/)) return true;
      if (!av.match(/^\d+$/) && bv.match(/^\d+$/)) return false;
      return av > bv;
    }
  }
  return false;
}

/**
 * Pick the numerically-highest tag from a list. Both inputs are assumed to
 * already match the source's tagPattern, so we can sort them confidently.
 */
export function pickHighestTag(tags: string[]): string | null {
  if (!tags.length) return null;
  return tags.reduce((best, t) => (isNewer(t, best) ? t : best));
}

interface DockerHubTagsPage {
  results?: Array<{ name: string; last_updated?: string }>;
  next?: string | null;
}

/**
 * Fetch up to 100 most-recently-pushed tags from Docker Hub, filter to ones
 * matching `tagPattern`, return the numerically-highest. Single page is fine
 * for our use: LSIO ships a few stable tags per month, the latest stable is
 * always in the recent push history.
 */
export async function fetchLatestFromDockerHub(
  repo: string,
  tagPattern: RegExp | undefined,
): Promise<{ tag: string; url: string } | null> {
  const res = await fetch(
    `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=100&ordering=last_updated`,
    {
      headers: { 'User-Agent': 'mmc-app-update-check' },
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    throw new Error(`Docker Hub /tags returned ${res.status}`);
  }
  const body = (await res.json()) as DockerHubTagsPage;
  const candidates = (body.results ?? [])
    .map((r) => r.name)
    .filter((name) => (tagPattern ? tagPattern.test(name) : true));
  const winner = pickHighestTag(candidates);
  if (!winner) return null;
  return { tag: winner, url: `https://hub.docker.com/r/${repo}/tags?name=${encodeURIComponent(winner)}` };
}

interface GhRelease {
  tag_name: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * Fetch up to 30 recent GitHub releases, filter to non-prerelease tags
 * matching `tagPattern`, return the numerically-highest. Used for first-
 * party GHCR images (recyclarr, seerr) where Docker Hub isn't an option.
 *
 * Note: we deliberately do NOT use /releases/latest. That endpoint returns
 * whatever the maintainer flagged as latest, which can momentarily be a
 * develop build (Prowlarr did exactly this — `v2.4.0.5397`). Filtering a
 * page of recent releases through tagPattern is more robust.
 */
export async function fetchLatestFromGitHubReleases(
  repo: string,
  tagPattern: RegExp | undefined,
): Promise<{ tag: string; url: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mmc-app-update-check',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`GitHub /releases returned ${res.status}`);
  }
  const releases = (await res.json()) as GhRelease[];
  const candidates = releases
    .filter((r) => !r.prerelease && !r.draft)
    .map((r) => r.tag_name)
    .filter((tag) => (tagPattern ? tagPattern.test(tag) : true));
  const winner = pickHighestTag(candidates);
  if (!winner) return null;
  const matched = releases.find((r) => r.tag_name === winner);
  return { tag: winner, url: matched?.html_url ?? `https://github.com/${repo}/releases/tag/${winner}` };
}

interface GhcrTagList {
  tags?: string[];
}

/**
 * Fetch tags from GitHub Container Registry.
 *
 * Unlike Docker Hub's plain JSON endpoint, GHCR speaks the OCI distribution
 * spec and requires a bearer token even for public images — an anonymous
 * one, but the handshake is mandatory. Two hops: mint a pull-scoped token,
 * then list tags with it.
 */
export async function fetchLatestFromGhcr(
  repo: string,
  tagPattern: RegExp | undefined,
): Promise<{ tag: string; url: string } | null> {
  const tokenRes = await fetch(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${repo}:pull`,
    { headers: { 'User-Agent': 'mmc-app-update-check' }, cache: 'no-store' },
  );
  if (!tokenRes.ok) {
    throw new Error(`GHCR token returned ${tokenRes.status}`);
  }
  const { token } = (await tokenRes.json()) as { token?: string };
  if (!token) throw new Error('GHCR token response had no token');

  const res = await fetch(`https://ghcr.io/v2/${repo}/tags/list?n=100`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'mmc-app-update-check' },
    cache: 'no-store',
  });
  if (!res.ok) {
    // 403 here usually means the package is private — the anonymous token is
    // issued but carries no pull scope. Say so rather than "no tags found".
    if (res.status === 403) {
      throw new Error('GHCR denied access — is the package public?');
    }
    throw new Error(`GHCR /tags/list returned ${res.status}`);
  }
  const body = (await res.json()) as GhcrTagList;
  const candidates = (body.tags ?? []).filter((t) => (tagPattern ? tagPattern.test(t) : true));
  const winner = pickHighestTag(candidates);
  if (!winner) return null;
  return { tag: winner, url: `https://github.com/${repo.split('/')[0]}/mmc/releases/tag/${winner}` };
}

async function fetchLatestForSource(source: AppUpdateSource): Promise<{ tag: string; url: string } | null> {
  if (source.kind === 'docker-hub') {
    return fetchLatestFromDockerHub(source.repo, source.tagPattern);
  }
  if (source.kind === 'ghcr') {
    return fetchLatestFromGhcr(source.repo, source.tagPattern);
  }
  return fetchLatestFromGitHubReleases(source.repo, source.tagPattern);
}

/**
 * Read .env, walk the IMAGE_* entries with a known source, return one
 * AppVersionInfo per app. Network calls run in parallel; per-row failures
 * surface as `error` rather than failing the whole payload.
 */
export async function buildAppUpdatesPayload(): Promise<AppUpdatesPayload> {
  const env = readEnv();

  // Driven by the manifest, in manifest order. The env schema is consulted
  // only for the pinned image value and its default — the label and the
  // compose service name come from the service's own declaration rather
  // than being reverse-engineered from the env var (they used to be: the
  // label by stripping " Image" off the field label, the service by taking
  // affectsServices[0], which was only ever right by convention).
  const targets = Object.entries(APP_UPDATE_SOURCES).map(([imageKey, source]) => {
    const def = ENV_SCHEMA.find((d) => d.key === imageKey);
    return {
      imageKey,
      source,
      svc: SERVICE_BY_IMAGE_KEY[imageKey],
      currentValue: env[imageKey] || def?.default || '',
    };
  });

  const apps = await Promise.all(
    targets.map(async ({ imageKey, source, svc, currentValue }): Promise<AppVersionInfo> => {
      const { image, tag } = parseImageRef(currentValue);
      const base: Omit<AppVersionInfo, 'latestTag' | 'updateAvailable' | 'releaseUrl' | 'error'> = {
        key: imageKey,
        label: svc.label,
        service: svc.name,
        image,
        currentTag: tag,
        sourceRepo: source.repo,
      };
      try {
        const latest = await fetchLatestForSource(source);
        if (!latest) {
          return { ...base, latestTag: null, updateAvailable: false, releaseUrl: null, error: 'No matching tags found' };
        }
        const imageTag = source.tagToImageTag ? source.tagToImageTag(latest.tag) : latest.tag;
        return {
          ...base,
          latestTag: imageTag,
          updateAvailable: isNewer(imageTag, tag),
          releaseUrl: latest.url,
        };
      } catch (err) {
        return {
          ...base,
          latestTag: null,
          updateAvailable: false,
          releaseUrl: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return { apps, checkedAt: new Date().toISOString() };
}
