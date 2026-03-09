import { NextResponse } from 'next/server';
import { VALID_SERVICES, stopService } from '@/lib/docker';

export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!VALID_SERVICES.has(name)) {
    return NextResponse.json({ error: `Unknown service: ${name}` }, { status: 404 });
  }

  if (name === 'media-ui') {
    return NextResponse.json({ error: 'Cannot stop the web UI from itself' }, { status: 400 });
  }

  try {
    await stopService(name);
    return NextResponse.json({ status: 'stopped', service: name });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to stop ${name}`, details: String(err) },
      { status: 500 }
    );
  }
}
