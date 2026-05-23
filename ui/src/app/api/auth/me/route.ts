import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasAdmins } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('mmc-session')?.value;
  const adminsExist = hasAdmins();

  const buildResponse = (data: Record<string, unknown>) => {
    const res = NextResponse.json(data);
    // Sync the has-admins cookie so middleware can check without file I/O.
    // This is a hint only — the real auth gate is requireAdmin() in each
    // route, which reads from disk. Marking httpOnly stops client JS from
    // tampering with it.
    if (adminsExist && request.cookies.get('mmc-has-admins')?.value !== '1') {
      res.cookies.set('mmc-has-admins', '1', {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 365 * 10,
      });
    }
    return res;
  };

  if (!token) {
    return buildResponse({ authenticated: false, hasAdmins: adminsExist });
  }

  const session = getSession(token);
  if (!session) {
    return buildResponse({ authenticated: false, hasAdmins: adminsExist });
  }

  return buildResponse({
    authenticated: true,
    username: session.username,
    hasAdmins: true,
  });
}
