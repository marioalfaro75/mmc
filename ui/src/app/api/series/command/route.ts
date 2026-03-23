import { NextRequest, NextResponse } from 'next/server';
import { runCommand } from '@/lib/api/sonarr';
import { requireAdmin } from '@/lib/auth';

const ALLOWED_COMMANDS = ['MissingEpisodeSearch', 'SeriesSearch', 'EpisodeSearch'];

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!ALLOWED_COMMANDS.includes(body.name)) {
      return NextResponse.json({ error: `Unknown command: ${body.name}` }, { status: 400 });
    }
    const result = await runCommand(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
