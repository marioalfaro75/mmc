import { describe, it, expect } from 'vitest';
import { formatHexIp, maskToCidr, formatRouteRow } from './proc-route';

describe('formatHexIp', () => {
  // 10.64.0.1 → bytes 10, 64, 0, 1 → LE hex 0x0100400a
  it('decodes little-endian hex IPs', () => {
    expect(formatHexIp(0x0100400a)).toBe('10.64.0.1');
  });

  it('handles 0.0.0.0', () => {
    expect(formatHexIp(0)).toBe('0.0.0.0');
  });

  it('handles 192.168.1.1', () => {
    // 192.168.1.1 → 0x0101a8c0 LE
    expect(formatHexIp(0x0101a8c0)).toBe('192.168.1.1');
  });
});

describe('maskToCidr', () => {
  it('255.255.255.0 → /24', () => {
    // mask stored LE: 0x00ffffff
    expect(maskToCidr(0x00ffffff)).toBe(24);
  });

  it('255.255.0.0 → /16', () => {
    expect(maskToCidr(0x0000ffff)).toBe(16);
  });

  it('0.0.0.0 → /0', () => {
    expect(maskToCidr(0)).toBe(0);
  });

  it('255.255.255.255 → /32', () => {
    expect(maskToCidr(0xffffffff)).toBe(32);
  });
});

describe('formatRouteRow', () => {
  // Real example: default via 10.64.0.1 dev wg0
  // Columns: Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT
  it('decodes a default route via WireGuard', () => {
    const row = 'wg0\t00000000\t0100400A\t0003\t0\t0\t0\t00000000\t0\t0\t0';
    expect(formatRouteRow(row)).toBe('default via 10.64.0.1 dev wg0');
  });

  // 10.64.0.0/32 (a peer route Mullvad-style) with no gateway
  it('decodes a /32 host route with no gateway', () => {
    const row = 'wg0\t0000400A\t00000000\t0005\t0\t0\t0\tFFFFFFFF\t0\t0\t0';
    expect(formatRouteRow(row)).toBe('10.64.0.0/32 dev wg0');
  });

  // Subnet route via a gateway
  it('decodes a subnet route with a gateway', () => {
    // 192.168.1.0/24 via 10.0.0.1 dev eth0
    const row = 'eth0\t0001A8C0\t0100000A\t0003\t0\t0\t0\t00FFFFFF\t0\t0\t0';
    expect(formatRouteRow(row)).toBe('192.168.1.0/24 dev eth0 via 10.0.0.1');
  });

  it('returns null for malformed input', () => {
    expect(formatRouteRow('not a route row')).toBeNull();
    expect(formatRouteRow('')).toBeNull();
    // parseInt('xyz', 16) → NaN (x is not a hex digit). 'bad' would parse
    // as 0xbad so we deliberately use a non-hex letter.
    expect(formatRouteRow('eth0\txyzzy\t0\t0\t0\t0\t0\t0\t0\t0\t0')).toBeNull();
  });
});
