import { describe, expect, it } from 'vitest';
import {
  generateOverrideYaml,
  stripMediaUiFromOverride,
  overrideMountsNasIntoMediaUi,
  NAS_MOUNTED_SERVICES,
  VOLUME_NAME,
  MOUNT_PATH,
} from './nas-override';

describe('generateOverrideYaml', () => {
  it('mounts the volume into sonarr, radarr and bazarr', () => {
    const yaml = generateOverrideYaml('smb');
    for (const svc of NAS_MOUNTED_SERVICES) {
      expect(yaml).toContain(`  ${svc}:`);
    }
    expect(yaml.match(new RegExp(`${VOLUME_NAME}:${MOUNT_PATH}`, 'g'))).toHaveLength(
      NAS_MOUNTED_SERVICES.length,
    );
  });

  it('never declares media-ui as a service', () => {
    // The regression this whole module exists to prevent: a failed CIFS
    // mount stops a container starting, so mounting into the dashboard
    // meant a NAS outage also took away the tool to diagnose it.
    //
    // Asserts on the service KEY, not the substring — the header comment
    // legitimately mentions media-ui to explain why it is absent.
    for (const proto of ['smb', 'nfs'] as const) {
      const serviceKeys = generateOverrideYaml(proto)
        .split('\n')
        .filter((l) => /^ {2}\S.*:$/.test(l))
        .map((l) => l.trim().replace(/:$/, ''));
      expect(serviceKeys).not.toContain('media-ui');
      expect(serviceKeys).toEqual(expect.arrayContaining([...NAS_MOUNTED_SERVICES]));
    }
  });

  it('emits a cifs volume for smb', () => {
    const yaml = generateOverrideYaml('smb');
    expect(yaml).toContain('type: cifs');
    expect(yaml).toContain('device: "//${NAS_HOST}/${NAS_SHARE}"');
  });

  it('emits an nfs volume for nfs', () => {
    const yaml = generateOverrideYaml('nfs');
    expect(yaml).toContain('type: nfs');
    expect(yaml).toContain('device: ":${NAS_SHARE}"');
  });

  it('honours NAS_VERS for both protocols', () => {
    // NFS previously hardcoded vers=4, silently ignoring the setting.
    expect(generateOverrideYaml('smb')).toContain('vers=${NAS_VERS:-3.0}');
    expect(generateOverrideYaml('nfs')).toContain('vers=${NAS_VERS:-4}');
  });

  it('round-trips through the healer unchanged', () => {
    for (const proto of ['smb', 'nfs'] as const) {
      expect(stripMediaUiFromOverride(generateOverrideYaml(proto))).toBeNull();
    }
  });
});

const LEGACY = `# header comment
volumes:
  nas-media:
    driver: local
    driver_opts:
      type: cifs
      device: "//\${NAS_HOST}/\${NAS_SHARE}"

services:
  sonarr:
    volumes:
      - nas-media:/mnt/nas/media
  radarr:
    volumes:
      - nas-media:/mnt/nas/media
  bazarr:
    volumes:
      - nas-media:/mnt/nas/media
  media-ui:
    volumes:
      - nas-media:/mnt/nas/media
`;

describe('stripMediaUiFromOverride', () => {
  it('removes a legacy media-ui block', () => {
    const out = stripMediaUiFromOverride(LEGACY);
    expect(out).not.toBeNull();
    expect(out).not.toContain('media-ui');
  });

  it('leaves the other services intact', () => {
    const out = stripMediaUiFromOverride(LEGACY)!;
    for (const svc of NAS_MOUNTED_SERVICES) {
      expect(out).toContain(`  ${svc}:`);
    }
    expect(out.match(/nas-media:\/mnt\/nas\/media/g)).toHaveLength(3);
  });

  it('returns null when there is nothing to fix', () => {
    expect(stripMediaUiFromOverride(generateOverrideYaml('smb'))).toBeNull();
  });

  it('handles media-ui in the middle of the service list', () => {
    const reordered = `services:
  sonarr:
    volumes:
      - nas-media:/mnt/nas/media
  media-ui:
    volumes:
      - nas-media:/mnt/nas/media
  radarr:
    volumes:
      - nas-media:/mnt/nas/media
`;
    const out = stripMediaUiFromOverride(reordered)!;
    expect(out).not.toContain('media-ui');
    expect(out).toContain('  sonarr:');
    expect(out).toContain('  radarr:');
  });

  it('leaves a hand-added media-ui block doing something else alone', () => {
    // Conservative on purpose — only strip a block that is purely the NAS
    // volume mount, so we never eat someone's custom config.
    const custom = `services:
  media-ui:
    environment:
      - CUSTOM=1
`;
    expect(stripMediaUiFromOverride(custom)).toBeNull();
  });

  it('ends with exactly one trailing newline', () => {
    const out = stripMediaUiFromOverride(LEGACY)!;
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});

describe('overrideMountsNasIntoMediaUi', () => {
  it('detects the legacy shape', () => {
    expect(overrideMountsNasIntoMediaUi(LEGACY)).toBe(true);
  });

  it('is false for a freshly generated file', () => {
    expect(overrideMountsNasIntoMediaUi(generateOverrideYaml('smb'))).toBe(false);
  });
});
