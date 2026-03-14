import { NextResponse } from 'next/server';
import { selfStop } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function POST() {
  logger.info('services', 'Stopping media-ui via helper container');
  selfStop();
  return NextResponse.json({ status: 'stopping', service: 'media-ui' });
}
