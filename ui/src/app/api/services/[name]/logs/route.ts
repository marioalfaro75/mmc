import { NextResponse } from 'next/server';
import { VALID_SERVICES, getServiceLogs } from '@/lib/docker';

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!VALID_SERVICES.has(name)) {
    return NextResponse.json({ error: `Unknown service: ${name}` }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const lines = Math.min(parseInt(searchParams.get('lines') || '100', 10) || 100, 500);

  try {
    const logs = await getServiceLogs(name, lines);
    return NextResponse.json({ service: name, logs });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to get logs for ${name}`, details: String(err) },
      { status: 500 }
    );
  }
}
