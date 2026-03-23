import { NextRequest, NextResponse } from 'next/server';
import { getPreferences, setPreferences } from '@/lib/api/qbittorrent';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const prefs = await getPreferences();
    return NextResponse.json({
      max_active_downloads: prefs.max_active_downloads,
      max_active_uploads: prefs.max_active_uploads,
      max_active_torrents: prefs.max_active_torrents,
      dl_limit: prefs.dl_limit,
      up_limit: prefs.up_limit,
      max_ratio: prefs.max_ratio,
      max_seeding_time: prefs.max_seeding_time,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch preferences: ${sanitizeError(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    await setPreferences(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save preferences: ${sanitizeError(error)}` },
      { status: 500 }
    );
  }
}
