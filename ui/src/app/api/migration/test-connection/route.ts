import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

const execFileAsync = promisify(execFile);

// Run a command on the host network via a temporary Docker container.
// The media-ui container is on an isolated Docker network and cannot
// reach the LAN directly, so we use the Docker socket to spawn a
// short-lived Alpine container with --net=host.
async function runOnHost(image: string, cmd: string[], timeoutMs = 15000): Promise<string> {
  const args = ['run', '--rm', '--net=host', image, ...cmd];
  const { stdout } = await execFileAsync('docker', args, { timeout: timeoutMs });
  return stdout;
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { host, protocol, sharePath, smbUser, smbPassword } = await request.json();

    if (!host || typeof host !== 'string') {
      return NextResponse.json({ success: false, error: 'Host is required' }, { status: 400 });
    }

    // Validate host format — only allow hostname/IP characters
    if (!/^[a-zA-Z0-9._-]+$/.test(host)) {
      return NextResponse.json({ success: false, error: 'Invalid host format' }, { status: 400 });
    }

    // Step 1: Ping via host network
    let reachable = false;
    try {
      await runOnHost('alpine', ['ping', '-c', '1', '-W', '3', host]);
      reachable = true;
    } catch {
      // Host may still be reachable if ICMP is blocked
    }

    // Step 2: Discover shares (runs whenever protocol is provided)
    let shareFound: boolean | null = null;
    let availableShares: string[] = [];
    let shareError: string | null = null;

    if (protocol) {
      try {
        if (protocol === 'nfs') {
          const stdout = await runOnHost(
            'alpine',
            ['sh', '-c', `apk add --no-cache -q nfs-utils >/dev/null 2>&1 && showmount -e --no-headers ${host}`],
            20000
          );
          availableShares = stdout
            .split('\n')
            .map((line) => line.trim().split(/\s+/)[0])
            .filter(Boolean);
        } else if (protocol === 'smb') {
          let smbCmd = `smbclient -L ${host} -N --no-pass`;
          if (smbUser) {
            const escapedUser = smbUser.replace(/'/g, "'\\''");
            const escapedPass = (smbPassword || '').replace(/'/g, "'\\''");
            smbCmd = `smbclient -L ${host} -U '${escapedUser}%${escapedPass}'`;
          }
          const stdout = await runOnHost(
            'alpine',
            ['sh', '-c', `apk add --no-cache -q samba-client >/dev/null 2>&1 && ${smbCmd}`],
            20000
          );
          // Parse smbclient output — share lines look like: "  ShareName  Disk  Comment"
          const shareLines = stdout.split('\n').filter((line) => /^\s+\S+\s+Disk/.test(line));
          availableShares = shareLines.map((line) => {
            const name = line.trim().split(/\s+/)[0];
            return `/${name}`;
          });
        }

        // Check if the user's share path is in the list
        if (sharePath && availableShares.length > 0) {
          if (protocol === 'nfs') {
            shareFound = availableShares.some((s) => s === sharePath || sharePath.startsWith(s + '/'));
          } else {
            const topLevel = '/' + sharePath.split('/').filter(Boolean)[0];
            shareFound = availableShares.some((s) => s === topLevel);
          }
        }
      } catch (err) {
        const msg = sanitizeError(err);
        shareError = `Could not list shares: ${msg}`;
      }
    }

    return NextResponse.json({
      success: true,
      reachable,
      shareFound,
      availableShares,
      shareError,
      message: !reachable ? 'Host did not respond to ping (may still work if ICMP is blocked)' : undefined,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}
