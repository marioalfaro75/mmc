/**
 * Egress classification for the Network page's routing evidence.
 *
 * Extracted as a pure function because getting this wrong is worse than
 * useless: an earlier version collapsed "we could not probe this container"
 * into the same branch as "this container is leaking", so FlareSolverr —
 * whose Python image ships no wget or curl — was reported as leaking while
 * simultaneously being kernel-proven to share Gluetun's network namespace.
 * A security indicator that cries wolf trains people to ignore it.
 *
 * Three states per client, never two.
 */

export type EgressState =
  /** Probe read an IP and it matches the tunnel's. */
  | 'match'
  /** Probe read an IP and it DIFFERS from the tunnel's. A real leak. */
  | 'leak'
  /** No IP, but the container shares the tunnel's network namespace, so its
   *  egress is identical by construction. Not a leak; not unknown. */
  | 'namespace'
  /** No IP and no namespace match. No evidence either way. */
  | 'unknown';

export interface ClientEgressInput {
  /** Public IP read from inside the container, or null if the probe failed. */
  ip: string | null;
  /** Network-namespace inode of the container, or null if unreadable. */
  inode: string | null;
}

export interface TunnelEgressInput {
  ip: string | null;
  inode: string | null;
}

/**
 * Classify one client's egress against the tunnel container.
 *
 * A definite IP mismatch always wins — the namespace fallback can never
 * mask a leak we actually observed, only fill in for a probe we could not
 * run at all.
 */
export function classifyEgress(
  client: ClientEgressInput,
  tunnel: TunnelEgressInput,
): EgressState {
  if (client.ip && tunnel.ip) {
    return client.ip === tunnel.ip ? 'match' : 'leak';
  }
  if (client.inode && tunnel.inode && client.inode === tunnel.inode) {
    return 'namespace';
  }
  return 'unknown';
}

/**
 * Roll per-client states into the section verdict.
 *   any leak            → fail
 *   all match/namespace → pass
 *   otherwise           → unknown
 */
export function rollUpEgressVerdict(states: EgressState[]): 'pass' | 'fail' | 'unknown' {
  if (states.length === 0) return 'unknown';
  if (states.includes('leak')) return 'fail';
  if (states.every((s) => s === 'match' || s === 'namespace')) return 'pass';
  return 'unknown';
}
