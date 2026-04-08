import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Admin {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

interface AdminsFile {
  admins: Admin[];
}

interface Session {
  token: string;
  adminId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const CONFIG_DIR = (() => {
  // CONFIG_ROOT may not be an env var in the container; derive from HOST_PROJECT_DIR
  if (process.env.CONFIG_ROOT) return process.env.CONFIG_ROOT;
  const hostProjectDir = process.env.HOST_PROJECT_DIR || '';
  const homeMatch = hostProjectDir.match(/^(\/home\/[^/]+)/);
  const home = homeMatch ? homeMatch[1] : process.env.HOME || '/root';
  return `${home}/.mmc/config`;
})();

const ADMINS_FILE = `${CONFIG_DIR}/admins.json`;
const SESSIONS_FILE = `${CONFIG_DIR}/admin-sessions.json`;

// Public pages that don't require admin login
const PUBLIC_PAGE_PATHS = new Set(['/', '/downloads', '/calendar', '/requests']);
const PUBLIC_API_PREFIXES = ['/api/health', '/api/dashboard', '/api/downloads', '/api/calendar', '/api/requests', '/api/auth', '/api/vpn'];

/* ------------------------------------------------------------------ */
/*  Password hashing                                                   */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex');
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Admin CRUD                                                         */
/* ------------------------------------------------------------------ */

function readAdminsFile(): AdminsFile {
  if (!existsSync(ADMINS_FILE)) return { admins: [] };
  try {
    return JSON.parse(readFileSync(ADMINS_FILE, 'utf-8'));
  } catch {
    return { admins: [] };
  }
}

function writeAdminsFile(data: AdminsFile): void {
  const dir = dirname(ADMINS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getAdmins(): Admin[] {
  return readAdminsFile().admins;
}

export function hasAdmins(): boolean {
  return getAdmins().length > 0;
}

export async function createAdmin(username: string, password: string): Promise<Admin> {
  const data = readAdminsFile();
  const admin: Admin = {
    id: randomBytes(16).toString('hex'),
    username,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  data.admins.push(admin);
  writeAdminsFile(data);
  return admin;
}

export async function updateAdmin(id: string, updates: { username?: string; password?: string }): Promise<Admin> {
  const data = readAdminsFile();
  const admin = data.admins.find(a => a.id === id);
  if (!admin) throw new Error('Admin not found');
  if (updates.username) admin.username = updates.username;
  if (updates.password) admin.passwordHash = await hashPassword(updates.password);
  writeAdminsFile(data);
  return admin;
}

export function deleteAdmin(id: string): void {
  const data = readAdminsFile();
  if (data.admins.length <= 1) throw new Error('Cannot delete the last admin');
  data.admins = data.admins.filter(a => a.id !== id);
  writeAdminsFile(data);
}

export async function authenticateAdmin(username: string, password: string): Promise<Admin | null> {
  const admins = getAdmins();
  const admin = admins.find(a => a.username === username);
  if (!admin) return null;
  const valid = await verifyPassword(password, admin.passwordHash);
  return valid ? admin : null;
}

/* ------------------------------------------------------------------ */
/*  Session management (file-backed, survives container restarts)      */
/* ------------------------------------------------------------------ */

const sessions = new Map<string, Session>();
let hydrated = false;

function hydrateSessions(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    if (!existsSync(SESSIONS_FILE)) return;
    const raw = readFileSync(SESSIONS_FILE, 'utf-8');
    const data = JSON.parse(raw) as Session[];
    const now = Date.now();
    for (const s of data) {
      // Validate shape and only keep unexpired sessions
      if (s && typeof s.token === 'string' && typeof s.expiresAt === 'number' && s.expiresAt > now) {
        sessions.set(s.token, s);
      }
    }
  } catch {
    // Corrupt or unreadable file — start fresh; log on next persist
  }
}

function persistSessions(): void {
  try {
    mkdirSync(dirname(SESSIONS_FILE), { recursive: true });
    const tmp = `${SESSIONS_FILE}.tmp`;
    const data = JSON.stringify(Array.from(sessions.values()));
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, SESSIONS_FILE);
  } catch {
    // Persistence failed — sessions still work in-memory until next restart
  }
}

export function createSession(admin: Admin): string {
  hydrateSessions();
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, {
    token,
    adminId: admin.id,
    username: admin.username,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_MS,
  });
  persistSessions();
  return token;
}

export function getSession(token: string): Session | null {
  hydrateSessions();
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    persistSessions();
    return null;
  }
  return session;
}

export function deleteSession(token: string): void {
  hydrateSessions();
  if (sessions.delete(token)) {
    persistSessions();
  }
}

/* ------------------------------------------------------------------ */
/*  Route classification                                               */
/* ------------------------------------------------------------------ */

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_PAGE_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  // Static assets, login, setup
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') return true;
  if (pathname === '/login' || pathname === '/admin-login' || pathname === '/setup') return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  API route helper                                                   */
/* ------------------------------------------------------------------ */

export function getAdminSession(request: Request): Session | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/mmc-session=([^;]+)/);
  if (!match) return null;
  return getSession(match[1]);
}

/**
 * Guard for admin-only API routes. Returns a 401 NextResponse if no valid
 * admin session exists, or null if the session is valid.
 * Usage:
 *   const denied = requireAdmin(request);
 *   if (denied) return denied;
 */
export function requireAdmin(request: Request): Response | null {
  if (!hasAdmins()) return null; // no admins configured — open access
  const session = getAdminSession(request);
  if (!session) {
    return Response.json(
      { error: 'Unauthorized — admin login required' },
      { status: 401 },
    );
  }
  return null;
}
