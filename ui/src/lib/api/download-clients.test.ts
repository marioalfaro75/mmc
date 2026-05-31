import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { downloadClientFlags } from './download-clients';

describe('downloadClientFlags', () => {
  let original: { qbt?: string; sab?: string };

  beforeEach(() => {
    original = {
      qbt: process.env.USE_QBITTORRENT,
      sab: process.env.USE_SABNZBD,
    };
  });

  afterEach(() => {
    if (original.qbt === undefined) delete process.env.USE_QBITTORRENT;
    else process.env.USE_QBITTORRENT = original.qbt;
    if (original.sab === undefined) delete process.env.USE_SABNZBD;
    else process.env.USE_SABNZBD = original.sab;
  });

  it('defaults qBit on, SAB off when nothing is set', () => {
    delete process.env.USE_QBITTORRENT;
    delete process.env.USE_SABNZBD;
    expect(downloadClientFlags()).toEqual({ useQbittorrent: true, useSabnzbd: false });
  });

  it('treats empty string as the default (EnvField placeholder)', () => {
    process.env.USE_QBITTORRENT = '';
    process.env.USE_SABNZBD = '';
    expect(downloadClientFlags()).toEqual({ useQbittorrent: true, useSabnzbd: false });
  });

  it('honours explicit on/off', () => {
    process.env.USE_QBITTORRENT = 'off';
    process.env.USE_SABNZBD = 'on';
    expect(downloadClientFlags()).toEqual({ useQbittorrent: false, useSabnzbd: true });
  });

  it('accepts the common truthy/falsy aliases', () => {
    for (const v of ['true', '1', 'YES', ' on ']) {
      process.env.USE_SABNZBD = v;
      expect(downloadClientFlags().useSabnzbd).toBe(true);
    }
    for (const v of ['false', '0', 'NO', 'off']) {
      process.env.USE_QBITTORRENT = v;
      expect(downloadClientFlags().useQbittorrent).toBe(false);
    }
  });

  it('falls back to the default for unrecognised values', () => {
    process.env.USE_QBITTORRENT = 'garbage';
    process.env.USE_SABNZBD = 'maybe';
    expect(downloadClientFlags()).toEqual({ useQbittorrent: true, useSabnzbd: false });
  });
});
