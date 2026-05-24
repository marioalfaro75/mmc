import { readFileSync, writeFileSync, copyFileSync, readdirSync, unlinkSync, chmodSync } from 'fs';
import { join, dirname } from 'path';

export const ENV_FILE_PATH = process.env.ENV_FILE_PATH || '.env';
const MAX_BACKUPS = 5;

export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments (not inside quoted values)
      const commentIndex = value.indexOf('#');
      if (commentIndex > 0 && value[commentIndex - 1] === ' ') {
        value = value.slice(0, commentIndex).trim();
      }
    }
    vars[key] = value;
  }
  return vars;
}

export function readEnv(): Record<string, string> {
  const content = readFileSync(ENV_FILE_PATH, 'utf-8');
  return parseEnvFile(content);
}

export function readEnvRaw(): string {
  return readFileSync(ENV_FILE_PATH, 'utf-8');
}

export function backupEnv(): string {
  const dir = dirname(ENV_FILE_PATH);
  const backupPath = join(dir, `.env.bak.${Date.now()}`);
  copyFileSync(ENV_FILE_PATH, backupPath);

  // Prune old backups, keep only MAX_BACKUPS
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('.env.bak.'))
      .sort()
      .reverse();
    for (const old of files.slice(MAX_BACKUPS)) {
      unlinkSync(join(dir, old));
    }
  } catch {
    // non-critical
  }

  return backupPath;
}

export function writeEnv(vars: Record<string, string>): void {
  backupEnv();

  let content = readFileSync(ENV_FILE_PATH, 'utf-8');

  for (const [key, value] of Object.entries(vars)) {
    // Need to quote values containing spaces or special chars
    const needsQuotes = value.includes(' ') || value.includes('#');
    const formatted = needsQuotes ? `"${value}"` : value;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${formatted}`);
    } else {
      content = content.trimEnd() + `\n${key}=${formatted}\n`;
    }
  }

  // Mode 0o600: the file contains VPN private keys, NAS credentials and
  // service API keys. fs.writeFileSync's mode option only applies when the
  // file is created; explicit chmod handles the case where it already exists
  // with looser perms (e.g. from an older install).
  writeFileSync(ENV_FILE_PATH, content, { encoding: 'utf-8', mode: 0o600 });
  try {
    chmodSync(ENV_FILE_PATH, 0o600);
  } catch {
    // best-effort — ignore on filesystems that don't support chmod
  }
}
