import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';

const ENV_FILE_PATH = process.env.ENV_FILE_PATH || '.env';
const PATH_KEYS = ['DATA_ROOT', 'CONFIG_ROOT', 'BACKUP_DIR'] as const;

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip inline comments (but not inside quoted values)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIndex = value.indexOf('#');
      if (commentIndex > 0 && value[commentIndex - 1] === ' ') {
        value = value.slice(0, commentIndex).trim();
      }
    }
    vars[key] = value;
  }
  return vars;
}

export async function GET() {
  try {
    const content = readFileSync(ENV_FILE_PATH, 'utf-8');
    const vars = parseEnvFile(content);
    const paths: Record<string, string> = {};
    for (const key of PATH_KEYS) {
      paths[key] = vars[key] || '';
    }
    return NextResponse.json(paths);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read .env file', details: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Validate: only allow PATH_KEYS, values must be absolute paths
    for (const key of PATH_KEYS) {
      const value = body[key];
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        return NextResponse.json(
          { error: `${key} must be a string` },
          { status: 400 }
        );
      }
      if (!value.startsWith('/')) {
        return NextResponse.json(
          { error: `${key} must be an absolute path (start with /)` },
          { status: 400 }
        );
      }
      if (value.includes('..')) {
        return NextResponse.json(
          { error: `${key} must not contain ".."` },
          { status: 400 }
        );
      }
    }

    let content = readFileSync(ENV_FILE_PATH, 'utf-8');

    for (const key of PATH_KEYS) {
      const value = body[key];
      if (value === undefined) continue;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content = content.trimEnd() + `\n${key}=${value}\n`;
      }
    }

    writeFileSync(ENV_FILE_PATH, content, 'utf-8');

    // Return updated paths
    const vars = parseEnvFile(content);
    const paths: Record<string, string> = {};
    for (const key of PATH_KEYS) {
      paths[key] = vars[key] || '';
    }
    return NextResponse.json(paths);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update .env file', details: String(err) },
      { status: 500 }
    );
  }
}
