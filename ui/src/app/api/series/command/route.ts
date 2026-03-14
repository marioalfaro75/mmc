import { NextRequest, NextResponse } from 'next/server';
import { runCommand } from '@/lib/api/sonarr';

const ALLOWED_COMMANDS = ['MissingEpisodeSearch', 'SeriesSearch'];

export async function POST(request: NextRequest) {
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
