import { NextResponse } from 'next/server';
import { downloadClientFlags } from '@/lib/api/download-clients';
import { requireAdmin } from '@/lib/auth';

// Next would otherwise inline the build-time values of USE_QBITTORRENT /
// USE_SABNZBD because the handler is small and request-independent. Force
// dynamic so the env reads happen on every request.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json(downloadClientFlags());
}
