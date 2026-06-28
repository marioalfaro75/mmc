import { describe, expect, it } from 'vitest';
import { parseImageRef, isNewer, pickHighestTag, APP_UPDATE_SOURCES } from './app-updates';

describe('parseImageRef', () => {
  it('splits a standard tag', () => {
    expect(parseImageRef('lscr.io/linuxserver/prowlarr:1.31.2')).toEqual({
      image: 'lscr.io/linuxserver/prowlarr',
      tag: '1.31.2',
    });
  });

  it('handles a v-prefixed tag', () => {
    expect(parseImageRef('ghcr.io/seerr-team/seerr:v3.2.0')).toEqual({
      image: 'ghcr.io/seerr-team/seerr',
      tag: 'v3.2.0',
    });
  });

  it('does not confuse a registry port for a tag', () => {
    expect(parseImageRef('registry.example.com:5000/foo/bar')).toEqual({
      image: 'registry.example.com:5000/foo/bar',
      tag: 'latest',
    });
  });

  it('handles a tag on an image with a registry port', () => {
    expect(parseImageRef('registry.example.com:5000/foo/bar:1.2.3')).toEqual({
      image: 'registry.example.com:5000/foo/bar',
      tag: '1.2.3',
    });
  });

  it('defaults missing tag to latest', () => {
    expect(parseImageRef('busybox')).toEqual({ image: 'busybox', tag: 'latest' });
  });
});

describe('isNewer', () => {
  it('detects newer patch version', () => {
    expect(isNewer('1.31.4', '1.31.2')).toBe(true);
    expect(isNewer('1.31.2', '1.31.4')).toBe(false);
  });

  it('detects newer minor version', () => {
    expect(isNewer('1.32.0', '1.31.9')).toBe(true);
  });

  it('detects newer major version', () => {
    expect(isNewer('5.0.4', '4.99.99')).toBe(true);
  });

  it('treats equal as not newer', () => {
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
  });

  it('ignores leading v on either side', () => {
    expect(isNewer('v3.41', 'v3.40')).toBe(true);
    expect(isNewer('3.41', 'v3.40')).toBe(true);
    expect(isNewer('v3.41', '3.40')).toBe(true);
  });

  it('handles missing trailing segments (1.2 vs 1.2.0)', () => {
    expect(isNewer('1.2', '1.2.0')).toBe(false);
    expect(isNewer('1.2.1', '1.2')).toBe(true);
  });

  it('a stable release is newer than its prerelease', () => {
    expect(isNewer('1.2.0', '1.2.0-rc1')).toBe(true);
    expect(isNewer('1.2.0-rc1', '1.2.0')).toBe(false);
  });
});

describe('pickHighestTag', () => {
  it('returns null on an empty list', () => {
    expect(pickHighestTag([])).toBeNull();
  });

  it('returns the sole entry', () => {
    expect(pickHighestTag(['1.0.0'])).toBe('1.0.0');
  });

  it('picks the numerically-highest, not the lexicographically-highest', () => {
    // Plain alphabetical sort would put 1.5.0 above 1.41.4 — wrong.
    expect(pickHighestTag(['1.5.0', '1.41.4', '1.31.2'])).toBe('1.41.4');
  });

  it('handles v-prefixed tags', () => {
    expect(pickHighestTag(['v3.40', 'v3.41', 'v3.39'])).toBe('v3.41');
  });
});

describe('APP_UPDATE_SOURCES', () => {
  it('covers every standard app', () => {
    for (const key of ['IMAGE_SONARR', 'IMAGE_RADARR', 'IMAGE_PROWLARR', 'IMAGE_BAZARR', 'IMAGE_QBITTORRENT']) {
      expect(APP_UPDATE_SOURCES[key]).toBeDefined();
    }
  });

  it('uses docker-hub for LSIO images', () => {
    // The whole point of the rewrite: LSIO images must read from Docker
    // Hub, not upstream GH releases, so we surface tags the registry
    // actually carries.
    for (const key of ['IMAGE_SONARR', 'IMAGE_RADARR', 'IMAGE_PROWLARR', 'IMAGE_BAZARR', 'IMAGE_QBITTORRENT', 'IMAGE_SABNZBD']) {
      expect(APP_UPDATE_SOURCES[key].kind).toBe('docker-hub');
      expect(APP_UPDATE_SOURCES[key].repo).toMatch(/^linuxserver\//);
    }
  });

  it('pins LSIO sources to clean 3-segment semver', () => {
    // This pattern is what excludes `latest`, `develop`, `nightly`, and
    // build-suffixed tags like `1.31.2-ls289` or `arm64v8-1.31.2`.
    const pat = APP_UPDATE_SOURCES.IMAGE_PROWLARR.tagPattern!;
    expect(pat.test('1.31.2')).toBe(true);
    expect(pat.test('1.41.4')).toBe(true);
    expect(pat.test('latest')).toBe(false);
    expect(pat.test('develop')).toBe(false);
    expect(pat.test('nightly')).toBe(false);
    expect(pat.test('1.31.2-ls289')).toBe(false);
    expect(pat.test('arm64v8-1.31.2')).toBe(false);
    expect(pat.test('v2.4.0.5397')).toBe(false); // the regression that prompted this rewrite
  });
});
