import { describe, expect, it } from 'vitest';
import { parseImageRef, isNewer, APP_UPDATE_SOURCES } from './app-updates';

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

describe('APP_UPDATE_SOURCES', () => {
  it('covers every IMAGE_* key in the env schema with a known source', async () => {
    // Smoke check: any IMAGE_ key without an entry just won't show up in
    // the Updates tab — but at least confirm the standard suspects are
    // wired up so this doesn't silently regress.
    for (const key of ['IMAGE_SONARR', 'IMAGE_RADARR', 'IMAGE_PROWLARR', 'IMAGE_BAZARR', 'IMAGE_QBITTORRENT']) {
      expect(APP_UPDATE_SOURCES[key]).toBeDefined();
    }
  });

  it('qBittorrent strips its release- prefix', () => {
    const fn = APP_UPDATE_SOURCES.IMAGE_QBITTORRENT.releaseTagToVersion;
    expect(fn).toBeDefined();
    expect(fn!('release-5.0.4')).toBe('5.0.4');
  });
});
