import { NextRequest, NextResponse } from 'next/server';
import { readSchedule, writeSchedule } from '@/lib/backup-schedule';
import { sanitizeError } from '@/lib/security';

export async function GET() {
  try {
    return NextResponse.json(readSchedule());
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to read schedule: ${sanitizeError(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const current = readSchedule();

    const schedule = {
      ...current,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
      frequency: body.frequency === 'daily' || body.frequency === 'weekly' ? body.frequency : current.frequency,
      time: typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : current.time,
      dayOfWeek: typeof body.dayOfWeek === 'number' && body.dayOfWeek >= 0 && body.dayOfWeek <= 6 ? body.dayOfWeek : current.dayOfWeek,
      maxBackups: typeof body.maxBackups === 'number' && body.maxBackups >= 1 && body.maxBackups <= 50 ? body.maxBackups : current.maxBackups,
      lastRun: current.lastRun,
    };

    writeSchedule(schedule);
    return NextResponse.json(schedule);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save schedule: ${sanitizeError(error)}` },
      { status: 500 }
    );
  }
}
