import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  time: string;       // "HH:MM" 24h format
  dayOfWeek: number;  // 0=Sunday, only used for weekly
  maxBackups: number;
  lastRun: string | null; // ISO timestamp
}

const DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: false,
  frequency: 'daily',
  time: '03:00',
  dayOfWeek: 0,
  maxBackups: 7,
  lastRun: null,
};

const CONFIG_PATH = `${process.env.HOME}/.mmc/backup-schedule.json`;

export function readSchedule(): BackupSchedule {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
}

export function writeSchedule(schedule: BackupSchedule): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(schedule, null, 2));
}
