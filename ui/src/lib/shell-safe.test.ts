import { describe, it, expect } from 'vitest';
import { shellEscape, isValidPath, isValidHost, resolvePath } from './shell-safe';

describe('shellEscape', () => {
  it('wraps plain strings in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'");
  });

  it('survives empty input', () => {
    expect(shellEscape('')).toBe("''");
  });

  it('escapes embedded single quotes', () => {
    // " O'Brien " becomes  'O'\''Brien'
    expect(shellEscape("O'Brien")).toBe("'O'\\''Brien'");
  });

  it('leaves shell metacharacters inert because they are quoted', () => {
    const dangerous = '; rm -rf / # $(whoami) `id` $HOME';
    const escaped = shellEscape(dangerous);
    // Whole payload is one single-quoted string, so nothing inside is expanded.
    expect(escaped.startsWith("'")).toBe(true);
    expect(escaped.endsWith("'")).toBe(true);
    expect(escaped).not.toContain("''" + dangerous); // sanity: not accidentally double-wrapped
  });
});

describe('isValidPath', () => {
  it('accepts typical mount points', () => {
    expect(isValidPath('/mnt/nas')).toBe(true);
    expect(isValidPath('/srv/media')).toBe(true);
    expect(isValidPath('/home/user/.mmc/data')).toBe(true);
    expect(isValidPath('/path with space')).toBe(true);
  });

  it('rejects path traversal', () => {
    expect(isValidPath('/mnt/../etc')).toBe(false);
    expect(isValidPath('..')).toBe(false);
  });

  it('rejects shell metacharacters', () => {
    expect(isValidPath('/mnt/$(whoami)')).toBe(false);
    expect(isValidPath('/mnt;rm -rf /')).toBe(false);
    expect(isValidPath('/mnt`id`')).toBe(false);
    expect(isValidPath('/mnt|cat')).toBe(false);
    expect(isValidPath('/mnt&id')).toBe(false);
    expect(isValidPath('/mnt\nrm')).toBe(false);
  });
});

describe('isValidHost', () => {
  it('accepts IPs, hostnames, and FQDNs', () => {
    expect(isValidHost('192.168.1.50')).toBe(true);
    expect(isValidHost('nas')).toBe(true);
    expect(isValidHost('nas.local')).toBe(true);
    expect(isValidHost('my-nas.lan')).toBe(true);
  });

  it('rejects shell injection attempts', () => {
    expect(isValidHost('nas; rm -rf /')).toBe(false);
    expect(isValidHost('$(whoami)')).toBe(false);
    expect(isValidHost('nas`id`')).toBe(false);
    expect(isValidHost('nas/share')).toBe(false);
  });
});

describe('resolvePath', () => {
  const originalHome = process.env.HOME;
  it('expands a leading tilde using $HOME', () => {
    process.env.HOME = '/home/tester';
    expect(resolvePath('~/.mmc/data')).toBe('/home/tester/.mmc/data');
    process.env.HOME = originalHome;
  });

  it('leaves absolute paths untouched', () => {
    expect(resolvePath('/srv/media')).toBe('/srv/media');
  });

  it('does not expand mid-string tildes', () => {
    expect(resolvePath('/foo/~bar')).toBe('/foo/~bar');
  });
});
