import { describe, expect, it } from 'vitest';
import { classifyEgress, rollUpEgressVerdict, type EgressState } from './egress-verdict';

const TUNNEL_IP = '87.249.133.224';
const TUNNEL_INODE = 'net:[4026532893]';
const tunnel = { ip: TUNNEL_IP, inode: TUNNEL_INODE };

describe('classifyEgress', () => {
  it('matching IP is a match', () => {
    expect(classifyEgress({ ip: TUNNEL_IP, inode: TUNNEL_INODE }, tunnel)).toBe('match');
  });

  it('differing IP is a leak', () => {
    expect(classifyEgress({ ip: '14.203.60.79', inode: TUNNEL_INODE }, tunnel)).toBe('leak');
  });

  it('an observed leak wins over a namespace match', () => {
    // Belt and braces: the namespace fallback must never be able to mask a
    // leak we actually measured. (In practice a shared netns can't produce
    // a different IP, so this asserts the precedence, not a real scenario.)
    expect(classifyEgress({ ip: '1.2.3.4', inode: TUNNEL_INODE }, tunnel)).toBe('leak');
  });

  it('no IP but same namespace is namespace-confirmed, NOT a leak', () => {
    // The FlareSolverr regression: its Python image ships no wget/curl, so
    // the probe returns null. It shares gluetun's netns, so egress is
    // identical by construction.
    expect(classifyEgress({ ip: null, inode: TUNNEL_INODE }, tunnel)).toBe('namespace');
  });

  it('no IP and different namespace is unknown, NOT a leak', () => {
    expect(classifyEgress({ ip: null, inode: 'net:[4026531840]' }, tunnel)).toBe('unknown');
  });

  it('no IP and no inode is unknown', () => {
    expect(classifyEgress({ ip: null, inode: null }, tunnel)).toBe('unknown');
  });

  it('falls back to namespace when the TUNNEL ip is unknown', () => {
    expect(
      classifyEgress({ ip: '1.2.3.4', inode: TUNNEL_INODE }, { ip: null, inode: TUNNEL_INODE }),
    ).toBe('namespace');
  });

  it('is unknown when nothing about the tunnel is known', () => {
    expect(
      classifyEgress({ ip: '1.2.3.4', inode: 'net:[1]' }, { ip: null, inode: null }),
    ).toBe('unknown');
  });
});

describe('rollUpEgressVerdict', () => {
  it('empty is unknown', () => {
    expect(rollUpEgressVerdict([])).toBe('unknown');
  });

  it('all match is pass', () => {
    expect(rollUpEgressVerdict(['match', 'match', 'match'])).toBe('pass');
  });

  it('mix of match and namespace is pass', () => {
    // The real post-FlareSolverr shape: qbit + sab probe fine, flaresolverr
    // is namespace-confirmed. Section should be green.
    expect(rollUpEgressVerdict(['match', 'match', 'namespace'])).toBe('pass');
  });

  it('all namespace is pass', () => {
    expect(rollUpEgressVerdict(['namespace', 'namespace'])).toBe('pass');
  });

  it('any leak is fail, even among passes', () => {
    expect(rollUpEgressVerdict(['match', 'leak', 'namespace'])).toBe('fail');
  });

  it('a leak outranks an unknown', () => {
    expect(rollUpEgressVerdict(['unknown', 'leak'])).toBe('fail');
  });

  it('any unknown without a leak downgrades pass to unknown', () => {
    expect(rollUpEgressVerdict(['match', 'unknown'])).toBe('unknown');
  });

  it('never reports fail without an actual leak', () => {
    const noLeak: EgressState[][] = [
      ['unknown'],
      ['unknown', 'unknown'],
      ['match', 'unknown'],
      ['namespace', 'unknown'],
      ['match', 'namespace'],
    ];
    for (const states of noLeak) {
      expect(rollUpEgressVerdict(states)).not.toBe('fail');
    }
  });
});
