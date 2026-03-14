import { NextResponse } from 'next/server';
import { VALID_SERVICES, stopService } from '@/lib/docker';
import { logger } from '@/lib/logger';

export async function POST() {
  const servicesToStop = Array.from(VALID_SERVICES).filter((s) => s !== 'media-ui');

  const results: { service: string; status: string; error?: string }[] = [];

  logger.info('services', `Stopping all services (except media-ui): ${servicesToStop.join(', ')}`);

  // Stop gluetun last since VPN-dependent services need it for graceful shutdown
  const gluetunLast = servicesToStop.filter((s) => s !== 'gluetun');
  if (servicesToStop.includes('gluetun')) gluetunLast.push('gluetun');

  for (const service of gluetunLast) {
    try {
      await stopService(service);
      results.push({ service, status: 'stopped' });
    } catch (err) {
      logger.error('services', `Failed to stop ${service}`, { error: String(err) });
      results.push({ service, status: 'error', error: String(err) });
    }
  }

  const failed = results.filter((r) => r.status === 'error');
  if (failed.length > 0) {
    return NextResponse.json(
      { status: 'partial', results, error: `Failed to stop: ${failed.map((f) => f.service).join(', ')}` },
      { status: 207 }
    );
  }

  logger.info('services', 'All services stopped (except media-ui)');
  return NextResponse.json({ status: 'stopped', results });
}
