import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, createSession } from '@/lib/auth';
import { SESSION_COOKIE_OPTIONS, HAS_ADMINS_COOKIE_OPTIONS } from '@/lib/cookies';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const admin = await authenticateAdmin(username, password);
    if (!admin) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const token = createSession(admin);
    const res = NextResponse.json({ ok: true, username: admin.username });
    res.cookies.set('mmc-session', token, SESSION_COOKIE_OPTIONS);
    res.cookies.set('mmc-has-admins', '1', HAS_ADMINS_COOKIE_OPTIONS);
    return res;
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
