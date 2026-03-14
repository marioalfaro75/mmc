import { NextResponse } from 'next/server';
import { VALID_SERVICES, startService } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!VALID_SERVICES.has(name)) {
    return NextResponse.json({ error: `Unknown service: ${name}` }, { status: 404 });
  }

  try {
    logger.info('services', `Starting service: ${name}`);
    await startService(name);
    logger.info('services', `Service started: ${name}`);
    return NextResponse.json({ status: 'started', service: name });
  } catch (err) {
    logger.error('services', `Failed to start ${name}`, { error: String(err) });
    return NextResponse.json(
      { error: `Failed to start ${name}`, details: String(err) },
      { status: 500 }
    );
  }
}
