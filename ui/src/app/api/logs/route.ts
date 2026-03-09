import { NextRequest, NextResponse } from 'next/server';
import { readAppLogs, LogLevel } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lines = Math.min(parseInt(searchParams.get('lines') || '200', 10), 2000);
    const level = searchParams.get('level') as LogLevel | null;

    const entries = readAppLogs(lines, level || undefined);
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read logs', details: String(err) },
      { status: 500 }
    );
  }
}
