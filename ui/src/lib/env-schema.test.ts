import { describe, it, expect } from 'vitest';
import { ENV_SCHEMA, EnvVarDef } from './env-schema';

const VALID_TYPES = new Set(['string', 'path', 'port', 'integer', 'boolean', 'select', 'secret', 'cron']);
const VALID_GROUPS = new Set(['general', 'vpn', 'network', 'services', 'images']);

describe('ENV_SCHEMA integrity', () => {
  it('has no duplicate keys', () => {
    const seen = new Set<string>();
    for (const e of ENV_SCHEMA) {
      expect(seen.has(e.key), `duplicate key: ${e.key}`).toBe(false);
      seen.add(e.key);
    }
  });

  it('every entry has the required fields', () => {
    for (const e of ENV_SCHEMA) {
      expect(e.key, 'missing key').toBeTruthy();
      expect(e.label, `${e.key} missing label`).toBeTruthy();
      expect(e.description, `${e.key} missing description`).toBeTruthy();
      expect(VALID_TYPES.has(e.type), `${e.key} has unknown type ${e.type}`).toBe(true);
      expect(VALID_GROUPS.has(e.group), `${e.key} has unknown group ${e.group}`).toBe(true);
      expect(Array.isArray(e.affectsServices), `${e.key} affectsServices not array`).toBe(true);
    }
  });

  it('defaults are strings when present', () => {
    for (const e of ENV_SCHEMA) {
      if (e.default !== undefined) {
        expect(typeof e.default, `${e.key} default not a string`).toBe('string');
      }
    }
  });

  it('select entries have non-empty options', () => {
    for (const e of ENV_SCHEMA) {
      if (e.type === 'select') {
        expect(Array.isArray(e.options) && e.options!.length > 0,
          `${e.key} is a select but has no options`).toBe(true);
      }
    }
  });

  it('select defaults are one of the listed options', () => {
    for (const e of ENV_SCHEMA) {
      if (e.type === 'select' && e.default !== undefined) {
        expect(e.options?.includes(e.default),
          `${e.key} default "${e.default}" is not in options [${e.options?.join(', ')}]`).toBe(true);
      }
    }
  });

  it('integer/port defaults parse as numbers', () => {
    for (const e of ENV_SCHEMA) {
      if ((e.type === 'integer' || e.type === 'port') && e.default !== undefined) {
        expect(Number.isFinite(Number(e.default)),
          `${e.key} (${e.type}) has non-numeric default "${e.default}"`).toBe(true);
      }
    }
  });

  it('every key referenced is uppercase snake_case', () => {
    const pattern = /^[A-Z][A-Z0-9_]*$/;
    for (const e of ENV_SCHEMA) {
      expect(pattern.test(e.key), `${e.key} is not UPPER_SNAKE_CASE`).toBe(true);
    }
  });
});

describe('keys actually used by docker-compose', () => {
  // These are the variables docker-compose.yml substitutes. If one disappears
  // from the schema, the UI's Settings page can't render it any more.
  const REQUIRED_KEYS: ReadonlyArray<keyof EnvVarDef | string> = [
    'TZ', 'PUID', 'PGID',
    'DATA_ROOT', 'CONFIG_ROOT',
    'VPN_SERVICE_PROVIDER', 'VPN_TYPE', 'WIREGUARD_MTU',
    'DOCKER_SUBNET', 'LOCAL_SUBNET',
    'PORT_SONARR', 'PORT_RADARR', 'PORT_UI',
  ];
  const present = new Set(ENV_SCHEMA.map(e => e.key));
  for (const k of REQUIRED_KEYS) {
    it(`exposes ${k}`, () => {
      expect(present.has(k as string)).toBe(true);
    });
  }
});
