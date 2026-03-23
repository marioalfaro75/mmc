import { NextResponse } from 'next/server';
import { isTmdbConfigured } from '@/lib/api/tmdb';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ configured: isTmdbConfigured() });
}
