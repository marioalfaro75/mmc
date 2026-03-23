import { NextResponse } from 'next/server';
import { getMigrationState } from '@/lib/migration-state';
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
