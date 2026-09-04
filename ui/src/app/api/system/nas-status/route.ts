import { NextResponse } from 'next/server';
import { createConnection } from 'net';
import { requireAdmin } from '@/lib/auth';
import { readEnv } from '@/lib/env';
import { sanitizeError } from '@/lib/security';
import { NAS_MOUNTED_SERVICES } from '@/lib/nas-override';

export const dynamic = 'force-dynamic';

const SMB_PORT = 445;
const NFS_PORT = 2049;
const PROBE_TIMEOUT_MS = 3000;

export interface NasStatus {
  configured: boolean;
  host?: string;
  share?: string;
  port?: number;
  protocol?: 'smb' | 'nfs';
  reachable?: boolean;
  latencyMs?: number;
  error?: string;
  /** Services whose containers cannot start while the NAS is unreachable. */
  dependentServices: string[];
}

/** Plain TCP connect probe. Deliberately not an SMB handshake — we only
 *  want to answer "can the kernel reach this server at all", which is
 *  exactly the condition that decides whether a CIFS mount will succeed. */
function probeTcp(host: string, port: number): Promise<{ ok: boolean; ms: number; error?: string }> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const done = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, ms: Date.now() - started, error });
    };

    const socket = createConnection({ host, port });
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, `No response within ${PROBE_TIMEOUT_MS}ms`));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      // ECONNREFUSED still proves the host is up and routable, just not
      // serving on that port — worth distinguishing from "unreachable".
      done(false, err.code === 'ECONNREFUSED'
        ? `Host reachable but nothing listening on port ${port}`
        : err.code || err.message);
    });
  });
}

/**
 * Report whether the NAS backing the `nas-media` volume is reachable.
 *
 * media-ui deliberately does not mount that volume (see lib/nas-override),
 * so the dashboard stays up during a NAS outage. This endpoint is what fills
 * the resulting visibility gap: instead of the dashboard silently dying, it
 * stays up and tells you the NAS is down and which services that stops.
 */
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const env = readEnv();
    const host = env.NAS_HOST?.trim();
    const share = env.NAS_SHARE?.trim();

    if (!host) {
      return NextResponse.json({
        configured: false,
        dependentServices: [],
      } satisfies NasStatus);
    }

    // NAS_USERNAME is only written for SMB setups, so it's a reliable
    // discriminator between the two protocols the wizard supports.
    const protocol: 'smb' | 'nfs' = env.NAS_USERNAME ? 'smb' : 'nfs';
    const port = protocol === 'smb' ? SMB_PORT : NFS_PORT;

    const { ok, ms, error } = await probeTcp(host, port);

    return NextResponse.json({
      configured: true,
      host,
      share,
      port,
      protocol,
      reachable: ok,
      latencyMs: ms,
      ...(error ? { error } : {}),
      dependentServices: [...NAS_MOUNTED_SERVICES],
    } satisfies NasStatus);
  } catch (err) {
    return NextResponse.json(
      { configured: false, dependentServices: [], error: sanitizeError(err) } satisfies NasStatus,
      { status: 500 },
    );
  }
}
