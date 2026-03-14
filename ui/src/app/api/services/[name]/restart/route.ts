import { NextResponse } from 'next/server';
import { VALID_SERVICES, restartService, restartServicesStaged } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!VALID_SERVICES.has(name)) {
    return NextResponse.json({ error: `Unknown service: ${name}` }, { status: 404 });
  }

  try {
    logger.info('services', `Restarting service: ${name}`);

    if (name === 'media-ui') {
      await restartServicesStaged(['media-ui']);
    } else {
      await restartService(name);
    }

    logger.info('services', `Service restarted: ${name}`);
    return NextResponse.json({ status: 'restarted', services: [name] });
  } catch (err) {
    logger.error('services', `Failed to restart ${name}`, { error: String(err) });
    return NextResponse.json(
      { error: `Failed to restart ${name}`, details: String(err) },
      { status: 500 }
    );
  }
}
