import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

// Run a command on the host network via a temporary Docker container.
// The media-ui container is on an isolated Docker network and cannot
// reach the LAN directly, so we use the Docker socket to spawn a
// short-lived Alpine container with --net=host.
// Uses spawn instead of execFile to avoid SIGPIPE issues with
// long-running commands like smbclient in Docker-in-Docker.
async function runOnHost(image: string, cmd: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['run', '--rm', '--net=host', image, ...cmd];
    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d; });
    proc.stderr.on('data', (d: Buffer) => { stderr += d; });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Command timed out')); }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `Command exited with code ${code}`));
    });
  });
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
            60000
          );
          availableShares = stdout
            .split('\n')
            .map((line) => line.trim().split(/\s+/)[0])
            .filter(Boolean);
        } else if (protocol === 'smb') {
          const smbProto = "--option='client min protocol=SMB2'";
          let smbCmd = `smbclient -L ${host} -N --no-pass ${smbProto}`;
          if (smbUser) {
            const escapedUser = smbUser.replace(/'/g, "'\\''");
            const escapedPass = (smbPassword || '').replace(/'/g, "'\\''");
            smbCmd = `printf 'username=${escapedUser}\\npassword=${escapedPass}\\n' > /tmp/.smbauth && smbclient -L ${host} -A /tmp/.smbauth ${smbProto}; rm -f /tmp/.smbauth`;
          }
          const stdout = await runOnHost(
            'alpine',
            ['sh', '-c', `apk add --no-cache -q samba-client >/dev/null 2>&1 && ${smbCmd}`],
            60000
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
