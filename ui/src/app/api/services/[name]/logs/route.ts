import { NextResponse } from 'next/server';
import { VALID_SERVICES, getServiceLogs } from '@/lib/docker';
import { readEnv } from '@/lib/env';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

interface ServiceLogConfig {
  /** Path relative to CONFIG_ROOT (or absolute if starts with /) */
  dir: string;
  /** Primary log file name(s) — first match wins */
  files: string[];
  /** If true, list all log files in the dir for the user to pick */
  listAll?: boolean;
  /** If true, dir is an absolute path, not relative to CONFIG_ROOT */
  absolute?: boolean;
}

function getMediaUiLogDir(): string {
  if (existsSync('/app/logs')) return '/app/logs';
  return join(process.env.HOME || '/tmp', '.mmc', 'logs');
}

const SERVICE_LOG_MAP: Record<string, ServiceLogConfig> = {
  sonarr: { dir: 'sonarr/logs', files: ['sonarr.txt'] },
  radarr: { dir: 'radarr/logs', files: ['radarr.txt'] },
  prowlarr: { dir: 'prowlarr/logs', files: ['prowlarr.txt'] },
  bazarr: { dir: 'bazarr/log', files: ['bazarr.log'] },
  seerr: { dir: 'seerr/logs', files: ['seerr.log'] },
  recyclarr: { dir: 'recyclarr/logs/cli', files: [], listAll: true },
  'media-ui': { dir: getMediaUiLogDir(), files: ['app.log'], absolute: true },
};

function getConfigRoot(): string {
  try {
    const vars = readEnv();
    let root = vars.CONFIG_ROOT || `${process.env.HOME}/.mmc/config`;
    if (root.startsWith('~')) root = `${process.env.HOME}${root.slice(1)}`;
    return root;
  } catch {
    return `${process.env.HOME}/.mmc/config`;
  }
}

function tailLines(content: string, count: number): string {
  const lines = content.split('\n');
  return lines.slice(-count).join('\n');
}

function listLogFiles(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.log') || f.endsWith('.txt'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function readLogFile(filepath: string, lines: number): string | null {
  try {
    if (!existsSync(filepath)) return null;
    const content = readFileSync(filepath, 'utf-8');
    return tailLines(content, lines);
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { name } = await params;

  if (!VALID_SERVICES.has(name)) {
    return NextResponse.json({ error: `Unknown service: ${name}` }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const lines = Math.min(parseInt(searchParams.get('lines') || '200', 10) || 200, 2000);
  const source = searchParams.get('source') || 'app'; // 'app' or 'docker'
  const file = searchParams.get('file'); // specific log file name

  // Docker container logs
  if (source === 'docker') {
    try {
      const logs = await getServiceLogs(name, lines);
      return NextResponse.json({ service: name, source: 'docker', logs });
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to get docker logs for ${name}`, details: sanitizeError(err) },
        { status: 500 }
      );
    }
  }

  // Application log files from CONFIG_ROOT
  const configRoot = getConfigRoot();
  const logConfig = SERVICE_LOG_MAP[name];

  if (!logConfig) {
    // Services without file-based logs — fall back to docker logs
    try {
      const logs = await getServiceLogs(name, lines);
      return NextResponse.json({
        service: name,
        source: 'docker',
        logs,
        note: 'This service only has Docker container logs.',
      });
    } catch (err) {
      return NextResponse.json(
        { error: `No app logs available for ${name} and docker logs failed`, details: sanitizeError(err) },
        { status: 500 }
      );
    }
  }

  const logDir = logConfig.absolute ? logConfig.dir : join(configRoot, logConfig.dir);
  const availableFiles = listLogFiles(logDir);

  // If a specific file is requested
  if (file) {
    const safeName = file.replace(/[^a-zA-Z0-9._-]/g, '');
    const resolvedPath = join(logDir, safeName);
    if (!resolvedPath.startsWith(logDir)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }
    const content = readLogFile(resolvedPath, lines);
    if (content === null) {
      return NextResponse.json({ error: `Log file not found: ${safeName}` }, { status: 404 });
    }
    return NextResponse.json({
      service: name,
      source: 'app',
      file: safeName,
      logs: content,
      availableFiles,
    });
  }

  // Read the primary log file
  for (const candidate of logConfig.files) {
    const content = readLogFile(join(logDir, candidate), lines);
    if (content !== null) {
      return NextResponse.json({
        service: name,
        source: 'app',
        file: candidate,
        logs: content,
        availableFiles,
      });
    }
  }

  // If no primary files found, try the most recent file in the directory
  if (availableFiles.length > 0) {
    const latest = availableFiles[0];
    const content = readLogFile(join(logDir, latest), lines);
    return NextResponse.json({
      service: name,
      source: 'app',
      file: latest,
      logs: content || '',
      availableFiles,
    });
  }

  return NextResponse.json({
    service: name,
    source: 'app',
    logs: '',
    availableFiles: [],
    note: 'No log files found for this service.',
  });
}
