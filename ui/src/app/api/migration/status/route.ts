import { NextResponse } from 'next/server';
import { getMigrationState } from '@/lib/migration-state';

export async function GET() {
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
