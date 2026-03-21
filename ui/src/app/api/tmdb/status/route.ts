import { NextResponse } from 'next/server';
import { isTmdbConfigured } from '@/lib/api/tmdb';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ configured: isTmdbConfigured() });
}
