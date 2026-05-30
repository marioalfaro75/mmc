import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || '';

export interface UpdateCheckPayload {
  localSha: string;
  localBranch: string;
  remoteSha: string | null;
  updateAvailable: boolean;
  aheadBy: number;
  recentMessages: string[];
  repoUrl: string | null;
  compareUrl: string | null;
  checkedAt: string;
  error?: string;
}

/** Parse `git remote get-url origin` into { owner, repo }. */
export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  // https://github.com/owner/repo(.git)?  or  git@github.com:owner/repo(.git)?
  const m =
    url.match(/github\.com[:/]([^/]+)\/([^/.\s]+?)(?:\.git)?\/?$/) || null;
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', ['-C', HOST_PROJECT_DIR, ...args]);
  return stdout.trim();
}

export async function readLocalState(): Promise<{
  localSha: string;
  localBranch: string;
  repo: { owner: string; repo: string } | null;
  repoUrl: string | null;
}> {
  if (!HOST_PROJECT_DIR) {
    throw new Error('HOST_PROJECT_DIR is not set');
  }
  const [localSha, localBranch, remoteUrl] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'unknown'),
    git(['remote', 'get-url', 'origin']).catch(() => ''),
  ]);
  return {
    localSha,
    localBranch,
    repo: remoteUrl ? parseRepoUrl(remoteUrl) : null,
    repoUrl: remoteUrl || null,
  };
}

/** Hit GitHub for the latest commit on `branch` and (if it differs) the
 *  compare endpoint so we can surface the pending commit messages.
 */
export async function fetchRemoteState(
  owner: string,
  repo: string,
  branch: string,
  localSha: string,
): Promise<{
  remoteSha: string | null;
  aheadBy: number;
  recentMessages: string[];
  compareUrl: string | null;
}> {
  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mmc-update-check',
  };

  const headRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
    { headers: ghHeaders, cache: 'no-store' },
  );
  if (!headRes.ok) {
    throw new Error(`GitHub /commits/${branch} returned ${headRes.status}`);
  }
  const head = (await headRes.json()) as { sha: string };
  const remoteSha = head.sha;

  if (remoteSha === localSha) {
    return { remoteSha, aheadBy: 0, recentMessages: [], compareUrl: null };
  }

  const compareUrl = `https://github.com/${owner}/${repo}/compare/${localSha}...${remoteSha}`;
  try {
    const cmpRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${localSha}...${remoteSha}`,
      { headers: ghHeaders, cache: 'no-store' },
    );
    if (cmpRes.ok) {
      const cmp = (await cmpRes.json()) as {
        commits?: Array<{ commit: { message: string } }>;
      };
      const commits = cmp.commits ?? [];
      const recentMessages = commits
        .slice(-10)
        .map((c) => c.commit.message.split('\n')[0])
        .reverse();
      return {
        remoteSha,
        aheadBy: commits.length,
        recentMessages,
        compareUrl,
      };
    }
  } catch {
    // Compare endpoint fails (e.g. local SHA is unknown to remote — happens
    // on installs that pre-date a force-push). Fall through to bare info.
  }
  return { remoteSha, aheadBy: 0, recentMessages: [], compareUrl };
}
