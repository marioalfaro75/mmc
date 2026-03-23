import { NextResponse } from 'next/server';
import { selfStop } from '@/lib/docker';
import { logger } from '@/lib/logger';
import { requireAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  logger.info('services', 'Stopping media-ui via helper container');
  selfStop();
  return NextResponse.json({ status: 'stopping', service: 'media-ui' });
}
