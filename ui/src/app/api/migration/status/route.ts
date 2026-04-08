import { NextResponse } from 'next/server';
import { getMigrationState, resetMigrationState } from '@/lib/migration-state';
import { requireAdmin } from '@/lib/auth';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const state = getMigrationState();

  return NextResponse.json({
    running: state.running,
    phase: state.phase,
    steps: state.steps,
    currentStep: state.currentStep,
    rsyncProgress: state.rsyncProgress,
    error: state.error,
    sourcePath: state.sourcePath,
    destinationPath: state.destinationPath,
  });
}

// Reset migration state (dismiss completed/failed/cancelled migration)
export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const state = getMigrationState();

  // Don't allow reset while migration is running
  if (state.running) {
    return NextResponse.json({ success: false, error: 'Migration is still running' }, { status: 409 });
  }

  resetMigrationState();
  return NextResponse.json({ success: true });
}
