import { NextResponse } from 'next/server';
import { VALID_SERVICES, restartServicesStaged } from '@/lib/docker';

export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!VALID_SERVICES.has(name)) {
    return NextResponse.json({ error: `Unknown service: ${name}` }, { status: 404 });
  }

  try {
    await restartServicesStaged([name]);
    return NextResponse.json({ status: 'restarted', services: [name] });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to restart ${name}`, details: String(err) },
      { status: 500 }
    );
  }
}
