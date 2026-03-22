import { NextRequest, NextResponse } from 'next/server';
import { updateAdmin, deleteAdmin, getAdmins, getAdminSession } from '@/lib/auth';
import { sanitizeError } from '@/lib/security';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { username, password } = await request.json();

    // Check for duplicate username
    if (username) {
      const existing = getAdmins();
      if (existing.some(a => a.username === username.trim() && a.id !== id)) {
        return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
      }
    }

    if (username && (typeof username !== 'string' || username.length < 3)) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }
    if (password && (typeof password !== 'string' || password.length < 8)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const admin = await updateAdmin(id, {
      username: username?.trim(),
      password: password || undefined,
    });
    return NextResponse.json({
      id: admin.id,
      username: admin.username,
      createdAt: admin.createdAt,
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    deleteAdmin(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
