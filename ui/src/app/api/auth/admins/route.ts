import { NextRequest, NextResponse } from 'next/server';
import { getAdmins, createAdmin, getAdminSession } from '@/lib/auth';
import { sanitizeError } from '@/lib/security';

export async function GET(request: Request) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admins = getAdmins().map(a => ({
    id: a.id,
    username: a.username,
    createdAt: a.createdAt,
  }));

  return NextResponse.json({ admins });
}

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { username, password } = await request.json();

    if (!username || typeof username !== 'string' || username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Check for duplicate username
    const existing = getAdmins();
    if (existing.some(a => a.username === username.trim())) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    const admin = await createAdmin(username.trim(), password);
    return NextResponse.json({
      id: admin.id,
      username: admin.username,
      createdAt: admin.createdAt,
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
