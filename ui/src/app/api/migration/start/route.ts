import { NextRequest, NextResponse } from 'next/server';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { rm } from 'fs/promises';
import {
  getSeries, getRootFolders as getSonarrRootFolders,
  addRootFolder as addSonarrRootFolder, deleteRootFolder as deleteSonarrRootFolder,
  massUpdateSeries,
} from '@/lib/api/sonarr';
import {
  getMovies, getRootFolders as getRadarrRootFolders,
  addRootFolder as addRadarrRootFolder, deleteRootFolder as deleteRadarrRootFolder,
  massUpdateMovies,
} from '@/lib/api/radarr';
import {
  getMigrationState, setMigrationState, resetMigrationState,
  updateStep,
} from '@/lib/migration-state';
import { sanitizeError } from '@/lib/security';
import { requireAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';

const LOG = 'migration';
const execFileAsync = promisify(execFile);

function resolvePath(p: string): string {
  if (p.startsWith('~')) return `${process.env.HOME}${p.slice(1)}`;
  return p;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function startStep(stepIdx: number): void {
  const now = Date.now();
  updateStep(stepIdx, { status: 'running', startedAt: now });
  setMigrationState({ currentStep: stepIdx });
}

function completeStep(stepIdx: number, message: string): void {
  const now = Date.now();
  const step = getMigrationState().steps[stepIdx];
  const elapsed = step?.startedAt ? formatElapsed(now - step.startedAt) : '';
  const fullMessage = elapsed ? `${message} (${elapsed})` : message;
  updateStep(stepIdx, { status: 'ok', message: fullMessage, completedAt: now });
}

function failStep(stepIdx: number, message: string): void {
  const now = Date.now();
  updateStep(stepIdx, { status: 'error', message, completedAt: now });
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const current = getMigrationState();
  if (current.running) {
    return NextResponse.json({ success: false, error: 'Migration already in progress' }, { status: 409 });
  }

  try {
    const { destinationPath, updateDataRoot } = await request.json();

    if (!destinationPath || typeof destinationPath !== 'string') {
      return NextResponse.json({ success: false, error: 'Destination path is required' }, { status: 400 });
    }

    if (destinationPath.includes('..')) {
      return NextResponse.json({ success: false, error: 'Path traversal not allowed' }, { status: 400 });
    }

    const dataRoot = resolvePath(process.env.DATA_ROOT || '~/.mmc/data');
    const sourcePath = `${dataRoot}/media`;
    const destResolved = resolvePath(destinationPath);
    const destMedia = destResolved.endsWith('/media') ? destResolved : `${destResolved}/media`;

    logger.info(LOG, 'Migration starting', { sourcePath, destinationPath: destMedia, updateDataRoot });

    resetMigrationState();
    setMigrationState({
      running: true,
      phase: 'migrating',
      sourcePath,
      destinationPath: destMedia,
      steps: [
        { step: 'Add Sonarr root folder', status: 'pending' },
        { step: 'Add Radarr root folder', status: 'pending' },
        { step: 'Copy files to NAS', status: 'pending' },
        { step: 'Verify copied files', status: 'pending' },
        { step: 'Remove source files', status: 'pending' },
        { step: 'Update Sonarr series paths', status: 'pending' },
        { step: 'Update Radarr movie paths', status: 'pending' },
        { step: 'Remove old root folders', status: 'pending' },
        ...(updateDataRoot ? [{ step: 'Update DATA_ROOT in .env', status: 'pending' as const }] : []),
      ],
    });

    // Run migration asynchronously
    runMigration(sourcePath, destMedia, updateDataRoot).catch((err) => {
      const msg = sanitizeError(err);
      logger.error(LOG, `Migration failed unexpectedly: ${msg}`);
      setMigrationState({ running: false, phase: 'error', error: msg });
    });

    return NextResponse.json({ success: true, message: 'Migration started' });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}

async function runMigration(sourcePath: string, destMedia: string, updateDataRoot: boolean) {
  let stepIdx = 0;

  // Step 1: Add Sonarr root folder
  try {
    startStep(stepIdx);
    logger.info(LOG, 'Step 1: Adding Sonarr root folder');
    updateStep(stepIdx, { message: 'Connecting to Sonarr...' });
    const sonarrFolders = await getSonarrRootFolders();
    const newTvPath = `${destMedia}/tv`;
    if (sonarrFolders.some((f) => f.path === newTvPath)) {
      completeStep(stepIdx, 'Already exists');
      logger.info(LOG, `Sonarr root folder already exists: ${newTvPath}`);
    } else {
      updateStep(stepIdx, { message: `Adding ${newTvPath}...` });
      await addSonarrRootFolder(newTvPath);
      completeStep(stepIdx, `Added ${newTvPath}`);
      logger.info(LOG, `Added Sonarr root folder: ${newTvPath}`);
    }
  } catch (error) {
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.error(LOG, `Failed to add Sonarr root folder: ${msg}`);
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Add Sonarr root folder` });
    return;
  }
  stepIdx++;

  // Step 2: Add Radarr root folder
  try {
    startStep(stepIdx);
    logger.info(LOG, 'Step 2: Adding Radarr root folder');
    updateStep(stepIdx, { message: 'Connecting to Radarr...' });
    const radarrFolders = await getRadarrRootFolders();
    const newMoviesPath = `${destMedia}/movies`;
    if (radarrFolders.some((f) => f.path === newMoviesPath)) {
      completeStep(stepIdx, 'Already exists');
      logger.info(LOG, `Radarr root folder already exists: ${newMoviesPath}`);
    } else {
      updateStep(stepIdx, { message: `Adding ${newMoviesPath}...` });
      await addRadarrRootFolder(newMoviesPath);
      completeStep(stepIdx, `Added ${newMoviesPath}`);
      logger.info(LOG, `Added Radarr root folder: ${newMoviesPath}`);
    }
  } catch (error) {
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.error(LOG, `Failed to add Radarr root folder: ${msg}`);
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Add Radarr root folder` });
    return;
  }
  stepIdx++;

  // Step 3: rsync files
  try {
    startStep(stepIdx);
    logger.info(LOG, `Step 3: Copying files — ${sourcePath} -> ${destMedia}`);
    updateStep(stepIdx, { message: 'Starting file copy...' });
    await runRsync(sourcePath, destMedia, stepIdx);

    // Check if cancelled
    if (getMigrationState().phase === 'cancelled') {
      logger.warn(LOG, 'Migration cancelled during rsync');
      return;
    }

    const progress = getMigrationState().rsyncProgress;
    const detail = progress
      ? `${formatBytes(progress.bytesTransferred)} transferred, ${progress.filesTransferred} files`
      : 'Files copied';
    completeStep(stepIdx, detail);
    logger.info(LOG, `rsync completed: ${detail}`);
  } catch (error) {
    if (getMigrationState().phase === 'cancelled') {
      logger.warn(LOG, 'Migration cancelled during rsync');
      return;
    }
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.error(LOG, `rsync failed: ${msg}`);
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Copy files — ${msg}` });
    return;
  }
  stepIdx++;

  // Step 4: Verify copied files using rsync dry-run
  try {
    startStep(stepIdx);
    logger.info(LOG, 'Step 4: Verifying copied files');
    updateStep(stepIdx, { message: 'Running verification (rsync dry-run)...' });

    const src = sourcePath.endsWith('/') ? sourcePath : `${sourcePath}/`;
    const { stdout: dryRunOut } = await execFileAsync('rsync', [
      '-av', '--dry-run', '--itemize-changes', src, destMedia,
    ], { timeout: 120000 });

    // rsync dry-run outputs lines like ">f..T...... file.mkv" for files that differ
    // Filter to actual file transfers (lines starting with >f or cf for new/changed files)
    const pendingFiles = dryRunOut
      .split('\n')
      .filter((line) => /^[>c]f/.test(line));

    if (pendingFiles.length > 0) {
      const msg = `${pendingFiles.length} file(s) differ between source and destination`;
      failStep(stepIdx, msg);
      logger.error(LOG, `Verification failed: ${msg}`);
      setMigrationState({ running: false, phase: 'error', error: 'Verification failed — source files will NOT be removed' });
      return;
    }

    completeStep(stepIdx, 'All files verified — source and destination match');
    logger.info(LOG, 'File verification passed — source and destination match');
  } catch (error) {
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.error(LOG, `Verification failed: ${msg}`);
    setMigrationState({ running: false, phase: 'error', error: 'Verification failed — source files will NOT be removed' });
    return;
  }
  stepIdx++;

  // Step 5: Remove source files (only reached if verification passed)
  try {
    startStep(stepIdx);
    logger.info(LOG, `Step 5: Removing source files: ${sourcePath}`);
    updateStep(stepIdx, { message: `Removing ${sourcePath}...` });

    await rm(sourcePath, { recursive: true, force: true });

    completeStep(stepIdx, `Removed ${sourcePath}`);
    logger.info(LOG, `Source files removed: ${sourcePath}`);
  } catch (error) {
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.error(LOG, `Failed to remove source files: ${msg}`);
    // Non-fatal — files are already on the NAS, cleanup can be done manually
  }
  stepIdx++;

  // Step 6: Mass update Sonarr series
  try {
    startStep(stepIdx);
    logger.info(LOG, 'Step 6: Updating Sonarr series paths');
    updateStep(stepIdx, { message: 'Fetching series from Sonarr...' });
    const series = await getSeries();
    const seriesIds = series.map((s) => s.id);
    if (seriesIds.length > 0) {
      updateStep(stepIdx, { message: `Updating ${seriesIds.length} series...` });
      await massUpdateSeries(seriesIds, `${destMedia}/tv`);
      completeStep(stepIdx, `Updated ${seriesIds.length} series`);
      logger.info(LOG, `Updated ${seriesIds.length} Sonarr series paths`);
    } else {
      completeStep(stepIdx, 'No series to update');
      logger.info(LOG, 'No Sonarr series to update');
    }
  } catch (error) {
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.error(LOG, `Failed to update Sonarr series: ${msg}`);
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Update Sonarr series` });
    return;
  }
  stepIdx++;

  // Step 7: Mass update Radarr movies
  try {
    startStep(stepIdx);
    logger.info(LOG, 'Step 7: Updating Radarr movie paths');
    updateStep(stepIdx, { message: 'Fetching movies from Radarr...' });
    const movies = await getMovies();
    const movieIds = movies.map((m) => m.id);
    if (movieIds.length > 0) {
      updateStep(stepIdx, { message: `Updating ${movieIds.length} movies...` });
      await massUpdateMovies(movieIds, `${destMedia}/movies`);
      completeStep(stepIdx, `Updated ${movieIds.length} movies`);
      logger.info(LOG, `Updated ${movieIds.length} Radarr movie paths`);
    } else {
      completeStep(stepIdx, 'No movies to update');
      logger.info(LOG, 'No Radarr movies to update');
    }
  } catch (error) {
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.error(LOG, `Failed to update Radarr movies: ${msg}`);
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Update Radarr movies` });
    return;
  }
  stepIdx++;

  // Step 8: Remove old root folders
  try {
    startStep(stepIdx);
    logger.info(LOG, 'Step 8: Removing old root folders');
    updateStep(stepIdx, { message: 'Checking for old root folders...' });

    const sonarrFolders = await getSonarrRootFolders();
    const oldSonarrFolder = sonarrFolders.find((f) => f.path === '/data/media/tv');
    if (oldSonarrFolder) {
      updateStep(stepIdx, { message: 'Removing old Sonarr root folder...' });
      await deleteSonarrRootFolder(oldSonarrFolder.id);
      logger.info(LOG, 'Removed old Sonarr root folder: /data/media/tv');
    }

    const radarrFolders = await getRadarrRootFolders();
    const oldRadarrFolder = radarrFolders.find((f) => f.path === '/data/media/movies');
    if (oldRadarrFolder) {
      updateStep(stepIdx, { message: 'Removing old Radarr root folder...' });
      await deleteRadarrRootFolder(oldRadarrFolder.id);
      logger.info(LOG, 'Removed old Radarr root folder: /data/media/movies');
    }

    completeStep(stepIdx, 'Old root folders removed');
  } catch (error) {
    const msg = sanitizeError(error);
    failStep(stepIdx, msg);
    logger.warn(LOG, `Failed to remove old root folders (non-fatal): ${msg}`);
    // Non-fatal — continue
  }
  stepIdx++;

  // Step 9 (optional): Update DATA_ROOT in .env
  if (updateDataRoot) {
    try {
      startStep(stepIdx);
      logger.info(LOG, 'Step 9: Updating DATA_ROOT in .env');
      updateStep(stepIdx, { message: 'Writing .env file...' });

      const { writeEnv } = await import('@/lib/env');
      const destBase = destMedia.replace(/\/media$/, '');
      writeEnv({ DATA_ROOT: destBase });

      completeStep(stepIdx, `DATA_ROOT set to ${destBase}`);
      logger.info(LOG, `Updated DATA_ROOT to ${destBase}`);
    } catch (error) {
      const msg = sanitizeError(error);
      failStep(stepIdx, msg);
      logger.error(LOG, `Failed to update DATA_ROOT: ${msg}`);
    }
  }

  setMigrationState({ running: false, phase: 'complete', currentStep: -1 });
  logger.info(LOG, 'Migration completed successfully');
}

function runRsync(source: string, destination: string, stepIdx: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure trailing slash on source to copy contents, not directory itself
    const src = source.endsWith('/') ? source : `${source}/`;
    let lastLoggedPct = -1;

    const rsync = spawn('rsync', [
      '-av',
      '--info=progress2',
      '--no-inc-recursive',
      src,
      destination,
    ]);

    setMigrationState({ rsyncProcess: rsync });

    rsync.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      // Parse rsync --info=progress2 output
      // Full format: "1,234,567  42%  12.34MB/s  0:01:23 (xfr#50, ir-chk=1000/1050)"
      const match = line.match(/(\d[\d,]*)\s+(\d+)%\s+([\d.]+\w+\/s)\s+(\S+)/);
      if (match) {
        const bytesTransferred = parseInt(match[1].replace(/,/g, ''), 10);
        const pct = parseInt(match[2], 10);
        const speed = match[3];
        const eta = match[4];

        // Parse file transfer counts: (xfr#N, ir-chk=remaining/total) or (xfr#N, to-chk=remaining/total)
        let filesTransferred = 0;
        let totalFiles = 0;
        const xfrMatch = line.match(/xfr#(\d+)/);
        const chkMatch = line.match(/(?:ir|to)-chk=(\d+)\/(\d+)/);
        if (xfrMatch) filesTransferred = parseInt(xfrMatch[1], 10);
        if (chkMatch) totalFiles = parseInt(chkMatch[2], 10);

        // Estimate total bytes from percentage
        const totalBytes = pct > 0 ? Math.round(bytesTransferred / (pct / 100)) : 0;

        setMigrationState({
          rsyncProgress: {
            percentage: pct,
            bytesTransferred,
            totalBytes,
            filesTransferred,
            totalFiles,
            speed,
            eta,
          },
        });

        // Update step message with current progress
        const fileInfo = totalFiles > 0
          ? `${filesTransferred.toLocaleString()} / ${totalFiles.toLocaleString()} files`
          : `${filesTransferred.toLocaleString()} files`;
        updateStep(stepIdx, {
          message: `Copying — ${formatBytes(bytesTransferred)} transferred, ${fileInfo}, ${speed}, ETA ${eta}`,
        });

        // Log progress at 10% milestones
        if (pct % 10 === 0 && pct !== lastLoggedPct) {
          lastLoggedPct = pct;
          logger.info(LOG, `rsync progress: ${pct}% — ${formatBytes(bytesTransferred)} transferred, ${fileInfo}, ${speed}, ETA ${eta}`);
        }
      }
    });

    rsync.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        logger.warn(LOG, `rsync stderr: ${msg}`);
      }
    });

    rsync.on('close', (code) => {
      setMigrationState({ rsyncProcess: null });
      if (code === 0) {
        resolve();
      } else if (code === 20) {
        // rsync exit code 20 = received SIGUSR1 or SIGINT
        reject(new Error('rsync was cancelled'));
      } else {
        reject(new Error(`rsync exited with code ${code}`));
      }
    });

    rsync.on('error', (err) => {
      setMigrationState({ rsyncProcess: null });
      logger.error(LOG, `rsync process error: ${err.message}`);
      reject(err);
    });
  });
}
