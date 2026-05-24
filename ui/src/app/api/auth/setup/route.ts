import { NextRequest, NextResponse } from 'next/server';
import { hasAdmins, createAdmin, createSession } from '@/lib/auth';
import { sanitizeError } from '@/lib/security';
import { SESSION_COOKIE_OPTIONS, HAS_ADMINS_COOKIE_OPTIONS } from '@/lib/cookies';

export async function GET() {
  return NextResponse.json({ hasAdmins: hasAdmins() });
}

export async function POST(request: NextRequest) {
  try {
    if (hasAdmins()) {
      return NextResponse.json({ error: 'Setup already completed' }, { status: 403 });
    }

    const { username, password } = await request.json();

    if (!username || typeof username !== 'string' || username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const admin = await createAdmin(username.trim(), password);
    const token = createSession(admin);

    const res = NextResponse.json({ ok: true, username: admin.username });
    res.cookies.set('mmc-session', token, SESSION_COOKIE_OPTIONS);
    res.cookies.set('mmc-has-admins', '1', HAS_ADMINS_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
