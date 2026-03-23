import { NextResponse } from 'next/server';
import { listServices } from '@/lib/docker';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const services = await listServices();
    return NextResponse.json({ services });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list services', details: String(err) },
      { status: 500 }
    );
  }
}
