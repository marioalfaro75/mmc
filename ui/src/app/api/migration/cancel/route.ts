import { NextResponse } from 'next/server';
import { getMigrationState, setMigrationState } from '@/lib/migration-state';

export async function POST() {
  const state = getMigrationState();

  if (!state.running) {
    return NextResponse.json({ success: false, error: 'No migration in progress' }, { status: 400 });
  }

  // Kill rsync process if running
  if (state.rsyncProcess && !state.rsyncProcess.killed) {
    state.rsyncProcess.kill('SIGTERM');
  }

  setMigrationState({
    running: false,
    phase: 'cancelled',
    rsyncProcess: null,
    error: 'Migration cancelled by user',
  });

  return NextResponse.json({ success: true, message: 'Migration cancelled' });
}
