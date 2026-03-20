const SIX_HOURS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY = 60 * 1000;
const SCHEDULER_INTERVAL = 60 * 1000; // check every minute

async function searchMissing() {
  const sonarrUrl = process.env.SONARR_URL || 'http://sonarr:8989';
  const sonarrKey = process.env.SONARR_API_KEY || '';
  const radarrUrl = process.env.RADARR_URL || 'http://radarr:7878';
  const radarrKey = process.env.RADARR_API_KEY || '';

  const headers = (key: string) => ({
    'X-Api-Key': key,
    'Content-Type': 'application/json',
  });

  if (sonarrKey) {
    try {
      await fetch(`${sonarrUrl}/api/v3/command`, {
        method: 'POST',
        headers: headers(sonarrKey),
        body: JSON.stringify({ name: 'MissingEpisodeSearch' }),
        cache: 'no-store',
      });
      console.log(`[auto-search] Triggered missing episode search`);
    } catch (err) {
      console.warn(`[auto-search] Sonarr missing search failed: ${err}`);
    }
  }

  if (radarrKey) {
    try {
      await fetch(`${radarrUrl}/api/v3/command`, {
        method: 'POST',
        headers: headers(radarrKey),
        body: JSON.stringify({ name: 'MissingMoviesSearch' }),
        cache: 'no-store',
      });
      console.log(`[auto-search] Triggered missing movies search`);
    } catch (err) {
      console.warn(`[auto-search] Radarr missing search failed: ${err}`);
    }
  }
}

async function checkBackupSchedule() {
  try {
    // Dynamic requires to avoid webpack bundling Node.js modules for edge/client
    const fs = require('fs');
    const path = require('path');
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    const configPath = `${process.env.HOME}/.mmc/backup-schedule.json`;
    let schedule;
    try {
      schedule = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      return; // no schedule file = not configured
    }

    if (!schedule.enabled) return;

    const now = new Date();
    const [targetH, targetM] = schedule.time.split(':').map(Number);

    if (now.getHours() !== targetH || now.getMinutes() !== targetM) return;
    if (schedule.frequency === 'weekly' && now.getDay() !== schedule.dayOfWeek) return;

    // Prevent duplicate runs — check if we already ran today
    if (schedule.lastRun) {
      const last = new Date(schedule.lastRun);
      if (
        last.getFullYear() === now.getFullYear() &&
        last.getMonth() === now.getMonth() &&
        last.getDate() === now.getDate()
      ) return;
    }

    // Read env to find paths
    let envVars: Record<string, string> = {};
    try {
      const envPath = process.env.ENV_FILE_PATH || `${process.env.HOME}/.mmc/.env`;
      const envContent = fs.readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (match) envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* use defaults */ }

    const resolvePath = (p: string) => p.startsWith('~') ? `${process.env.HOME}${p.slice(1)}` : p;
    const configRoot = resolvePath(envVars.CONFIG_ROOT || `${process.env.HOME}/.mmc/config`);
    const backupDir = resolvePath(envVars.BACKUP_DIR || `${process.env.HOME}/.mmc/backups`);

    fs.mkdirSync(backupDir, { recursive: true });

    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `mars-media-centre-backup-${timestamp}.tar.gz`;
    const backupFile = path.join(backupDir, filename);

    console.log('[backup-scheduler] Starting scheduled backup...');
    await execFileAsync('tar', [
      '-czf', backupFile,
      '-C', path.dirname(configRoot),
      path.basename(configRoot),
    ], { timeout: 120000 });

    // Rotate old backups
    const maxBackups = schedule.maxBackups || 7;
    const files = fs.readdirSync(backupDir)
      .filter((f: string) => f.startsWith('mars-media-centre-backup-') && f.endsWith('.tar.gz'))
      .sort()
      .reverse();
    for (const old of files.slice(maxBackups)) {
      fs.unlinkSync(path.join(backupDir, old));
    }

    // Update lastRun
    schedule.lastRun = now.toISOString();
    fs.writeFileSync(configPath, JSON.stringify(schedule, null, 2));

    console.log(`[backup-scheduler] Scheduled backup complete: ${filename}`);
  } catch (err) {
    console.error(`[backup-scheduler] Backup failed: ${err}`);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Initial search after services have had time to start
  setTimeout(() => {
    searchMissing();
  }, STARTUP_DELAY);

  // Repeat every 6 hours
  setInterval(() => {
    searchMissing();
  }, SIX_HOURS);

  console.log('[auto-search] Scheduled missing content search every 6 hours');

  // Backup scheduler — check every minute
  setInterval(() => {
    checkBackupSchedule();
  }, SCHEDULER_INTERVAL);

  console.log('[backup-scheduler] Backup scheduler started');
}
