import { NextRequest, NextResponse } from 'next/server';
import { getPreferences, setPreferences } from '@/lib/api/qbittorrent';
import { sanitizeError } from '@/lib/security';

export async function GET() {
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
