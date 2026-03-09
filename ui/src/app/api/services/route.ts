import { NextResponse } from 'next/server';
import { listServices } from '@/lib/docker';

export async function GET() {
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
