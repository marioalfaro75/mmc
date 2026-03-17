import { NextResponse } from 'next/server';
import { VALID_SERVICES, listServices, startService } from '@/lib/docker';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/security';

export async function POST() {
  // Only start services that are not already running
  const current = await listServices();
  const runningSet = new Set(current.filter((s) => s.state === 'running').map((s) => s.service));

  const servicesToStart = Array.from(VALID_SERVICES).filter(
    (s) => s !== 'media-ui' && !runningSet.has(s)
  );

  if (servicesToStart.length === 0) {
    return NextResponse.json({ status: 'started', results: [] });
  }

  const results: { service: string; status: string; error?: string }[] = [];

  logger.info('services', `Starting services: ${servicesToStart.join(', ')}`);

  // Start gluetun first since VPN-dependent services need it
  const gluetunFirst = servicesToStart.filter((s) => s === 'gluetun');
  const rest = servicesToStart.filter((s) => s !== 'gluetun');

  for (const service of [...gluetunFirst, ...rest]) {
    try {
      await startService(service);
      results.push({ service, status: 'started' });
    } catch (err) {
      logger.error('services', `Failed to start ${service}`, { error: String(err) });
      results.push({ service, status: 'error', error: sanitizeError(err) });
    }
  }

  const failed = results.filter((r) => r.status === 'error');
  if (failed.length > 0) {
    return NextResponse.json(
      { status: 'partial', results, error: `Failed to start: ${failed.map((f) => f.service).join(', ')}` },
      { status: 207 }
    );
  }

  logger.info('services', 'All stopped services started');
  return NextResponse.json({ status: 'started', results });
}
