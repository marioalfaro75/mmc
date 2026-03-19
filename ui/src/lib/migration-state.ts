import type { ChildProcess } from 'child_process';

export interface MigrationStep {
  step: string;
  status: 'pending' | 'running' | 'ok' | 'error' | 'skipped';
  message?: string;
}

export interface MigrationState {
  running: boolean;
  phase: 'idle' | 'migrating' | 'complete' | 'error' | 'cancelled';
  steps: MigrationStep[];
  currentStep: number;
  rsyncProgress: {
    percentage: number;
    filesTransferred: number;
    totalFiles: number;
    speed: string;
    eta: string;
  } | null;
  error: string | null;
  rsyncProcess: ChildProcess | null;
  sourcePath: string;
  destinationPath: string;
}

const defaultState: MigrationState = {
  running: false,
  phase: 'idle',
  steps: [],
  currentStep: -1,
  rsyncProgress: null,
  error: null,
  rsyncProcess: null,
  sourcePath: '',
  destinationPath: '',
};

// Module-level singleton — survives across API requests within the same process
let state: MigrationState = { ...defaultState };

export function getMigrationState(): MigrationState {
  return state;
}

export function setMigrationState(update: Partial<MigrationState>): void {
  state = { ...state, ...update };
}

export function resetMigrationState(): void {
  state = { ...defaultState, steps: [], rsyncProcess: null };
}

export function updateStep(index: number, update: Partial<MigrationStep>): void {
  if (state.steps[index]) {
    state.steps[index] = { ...state.steps[index], ...update };
  }
}
