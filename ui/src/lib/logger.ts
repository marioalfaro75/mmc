import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_LOG_FILES = 3;

function getLogDir(): string {
  // Inside the container, logs are mounted at /app/logs
  // Outside, fall back to ~/.mmc/logs
  if (existsSync('/app/logs')) return '/app/logs';
  const home = process.env.HOME || '/tmp';
  return join(home, '.mmc', 'logs');
}

function getLogLevel(): LogLevel {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (level in LEVEL_ORDER) return level as LogLevel;
  return 'info';
}

function getLogFile(): string {
  const dir = getLogDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, 'app.log');
}

function rotateIfNeeded(filepath: string): void {
  try {
    if (!existsSync(filepath)) return;
    const stat = statSync(filepath);
    if (stat.size < MAX_LOG_SIZE) return;

    // Rotate: app.log.2 -> delete, app.log.1 -> app.log.2, app.log -> app.log.1
    const { renameSync, unlinkSync } = require('fs');
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? filepath : `${filepath}.${i - 1}`;
      const to = `${filepath}.${i}`;
      if (existsSync(from)) {
        if (i === MAX_LOG_FILES - 1 && existsSync(to)) unlinkSync(to);
        try { renameSync(from, to); } catch { /* ignore */ }
      }
    }
  } catch {
    // non-critical
  }
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
  const configuredLevel = getLogLevel();
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel]) return;

  const entry = {
    timestamp: formatTimestamp(),
    level,
    component,
    message,
    ...(data ? { data } : {}),
  };

  const line = JSON.stringify(entry) + '\n';

  try {
    const filepath = getLogFile();
    rotateIfNeeded(filepath);
    appendFileSync(filepath, line, 'utf-8');
  } catch {
    // Fallback to stderr if file logging fails
    process.stderr.write(line);
  }
}

export const logger = {
  debug: (component: string, message: string, data?: Record<string, unknown>) => log('debug', component, message, data),
  info: (component: string, message: string, data?: Record<string, unknown>) => log('info', component, message, data),
  warn: (component: string, message: string, data?: Record<string, unknown>) => log('warn', component, message, data),
  error: (component: string, message: string, data?: Record<string, unknown>) => log('error', component, message, data),
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

export function readAppLogs(lines = 200, level?: LogLevel): LogEntry[] {
  try {
    const filepath = getLogFile();
    if (!existsSync(filepath)) return [];

    const content = readFileSync(filepath, 'utf-8');
    const allLines = content.trim().split('\n').filter(Boolean);

    // Take last N lines
    const tail = allLines.slice(-lines);

    const entries: LogEntry[] = [];
    for (const line of tail) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (level && LEVEL_ORDER[entry.level] < LEVEL_ORDER[level]) continue;
        entries.push(entry);
      } catch {
        // skip malformed lines
      }
    }

    return entries;
  } catch {
    return [];
  }
}

export function getDeployLogDir(): string {
  const dir = getLogDir();
  return join(dirname(dir), 'logs');
}
