// Per-app image update checks.
//
// The /api/updates/check endpoint tracks the project's *git* commit.
// This module tracks the *image pins* in .env (IMAGE_PROWLARR=...:1.31.2)
// against the canonical upstream release of each app.
//
// We look at upstream GitHub releases rather than registry tags because the
// linuxserver/* tag streams mix LSIO build suffixes, develop tags, nightly
// tags, etc. The upstream repo's "latest release" is a clean signal that
// matches the LSIO image tag directly (LSIO ships `prowlarr:1.31.2` when
// Prowlarr/Prowlarr releases v1.31.2).

import { readEnv } from './env';
import { ENV_SCHEMA } from './env-schema';

export interface AppUpdateSource {
  /** GitHub `owner/repo` whose latest release matches this image's tag. */
  repo: string;
  /**
   * Map a GitHub release tag to the version string that appears in the
   * image tag. Default is identity (with stripV applied later inside the
   * compare). Used for upstream repos that prefix tags differently from
   * the registry — e.g. qBittorrent releases as `release-5.0.4` but the
   * lscr.io tag is `5.0.4`.
   */
  releaseTagToVersion?: (tag: string) => string;
}

// Pinned manually rather than derived from the image name — the upstream
// repo path is rarely the same as the registry path (linuxserver/docker-
// prowlarr builds Prowlarr/Prowlarr releases), and tag conventions differ.
export const APP_UPDATE_SOURCES: Record<string, AppUpdateSource> = {
  IMAGE_SONARR: { repo: 'Sonarr/Sonarr' },
  IMAGE_RADARR: { repo: 'Radarr/Radarr' },
  IMAGE_PROWLARR: { repo: 'Prowlarr/Prowlarr' },
  IMAGE_QBITTORRENT: {
    repo: 'qbittorrent/qBittorrent',
    releaseTagToVersion: (t) => t.replace(/^release-/, ''),
  },
  IMAGE_SABNZBD: { repo: 'sabnzbd/sabnzbd' },
  IMAGE_BAZARR: { repo: 'morpheus65535/bazarr' },
  IMAGE_SEERR: { repo: 'seerr-team/seerr' },
  IMAGE_GLUETUN: { repo: 'qdm12/gluetun' },
  IMAGE_RECYCLARR: { repo: 'recyclarr/recyclarr' },
  IMAGE_UNPACKERR: { repo: 'Unpackerr/unpackerr' },
  IMAGE_WATCHTOWER: { repo: 'containrrr/watchtower' },
};

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

/** Strip a leading `v` so `v3.40` compares equal to `3.40`. */
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
    // Numeric beats non-numeric (1.2.0 > 1.2.0-rc1).
    if (av !== bv) {
      if (av.match(/^\d+$/) && !bv.match(/^\d+$/)) return true;
      if (!av.match(/^\d+$/) && bv.match(/^\d+$/)) return false;
      return av > bv;
    }
  }
  return false;
}

interface GhRelease {
  tag_name: string;
  name?: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * Fetch the latest non-prerelease release for `owner/repo`.
 *
 * Uses /releases/latest (which already filters out prereleases & drafts);
 * falls back to /releases?per_page=10 when the project never marks a release
 * as "latest" (some only tag, never release-publish).
 */
export async function fetchLatestRelease(repo: string): Promise<{ tag: string; url: string } | null> {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mmc-app-update-check',
  };

  const latestRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
    cache: 'no-store',
  });
  if (latestRes.ok) {
    const r = (await latestRes.json()) as GhRelease;
    return { tag: r.tag_name, url: r.html_url };
  }
  if (latestRes.status !== 404) {
    throw new Error(`GitHub /releases/latest returned ${latestRes.status}`);
  }

  const listRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
    headers,
    cache: 'no-store',
  });
  if (!listRes.ok) {
    throw new Error(`GitHub /releases returned ${listRes.status}`);
  }
  const releases = (await listRes.json()) as GhRelease[];
  const stable = releases.find((r) => !r.prerelease && !r.draft);
  return stable ? { tag: stable.tag_name, url: stable.html_url } : null;
}

/**
 * Read .env, walk the IMAGE_* entries with a known release source, and
 * return one AppVersionInfo per app. Network calls are made in parallel.
 */
export async function buildAppUpdatesPayload(): Promise<AppUpdatesPayload> {
  const env = readEnv();

  const targets = ENV_SCHEMA
    .filter((def) => def.key.startsWith('IMAGE_') && APP_UPDATE_SOURCES[def.key])
    .map((def) => ({
      def,
      source: APP_UPDATE_SOURCES[def.key],
      currentValue: env[def.key] || def.default || '',
    }));

  const apps = await Promise.all(
    targets.map(async ({ def, source, currentValue }): Promise<AppVersionInfo> => {
      const { image, tag } = parseImageRef(currentValue);
      const baseLabel = def.label.replace(/\s+Image$/, '');
      const service = def.affectsServices[0] || def.key.replace(/^IMAGE_/, '').toLowerCase();
      const base: Omit<AppVersionInfo, 'latestTag' | 'updateAvailable' | 'releaseUrl' | 'error'> = {
        key: def.key,
        label: baseLabel,
        service,
        image,
        currentTag: tag,
        sourceRepo: source.repo,
      };
      try {
        const latest = await fetchLatestRelease(source.repo);
        if (!latest) {
          return { ...base, latestTag: null, updateAvailable: false, releaseUrl: null, error: 'No releases published yet' };
        }
        const normalized = source.releaseTagToVersion ? source.releaseTagToVersion(latest.tag) : latest.tag;
        return {
          ...base,
          latestTag: normalized,
          updateAvailable: isNewer(normalized, tag),
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
