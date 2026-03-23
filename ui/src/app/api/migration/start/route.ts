import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
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

function resolvePath(p: string): string {
  if (p.startsWith('~')) return `${process.env.HOME}${p.slice(1)}`;
  return p;
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
        { step: 'Update Sonarr series paths', status: 'pending' },
        { step: 'Update Radarr movie paths', status: 'pending' },
        { step: 'Remove old root folders', status: 'pending' },
        ...(updateDataRoot ? [{ step: 'Update DATA_ROOT in .env', status: 'pending' as const }] : []),
      ],
    });

    // Run migration asynchronously
    runMigration(sourcePath, destMedia, updateDataRoot).catch((err) => {
      setMigrationState({ running: false, phase: 'error', error: sanitizeError(err) });
    });

    return NextResponse.json({ success: true, message: 'Migration started' });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}

async function runMigration(sourcePath: string, destMedia: string, updateDataRoot: boolean) {
  const state = getMigrationState();
  let stepIdx = 0;

  // Step 1: Add Sonarr root folder
  try {
    updateStep(stepIdx, { status: 'running' });
    setMigrationState({ currentStep: stepIdx });
    const sonarrFolders = await getSonarrRootFolders();
    const newTvPath = `${destMedia}/tv`;
    if (sonarrFolders.some((f) => f.path === newTvPath)) {
      updateStep(stepIdx, { status: 'ok', message: 'Already exists' });
    } else {
      await addSonarrRootFolder(newTvPath);
      updateStep(stepIdx, { status: 'ok', message: `Added ${newTvPath}` });
    }
  } catch (error) {
    updateStep(stepIdx, { status: 'error', message: sanitizeError(error) });
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Add Sonarr root folder` });
    return;
  }
  stepIdx++;

  // Step 2: Add Radarr root folder
  try {
    updateStep(stepIdx, { status: 'running' });
    setMigrationState({ currentStep: stepIdx });
    const radarrFolders = await getRadarrRootFolders();
    const newMoviesPath = `${destMedia}/movies`;
    if (radarrFolders.some((f) => f.path === newMoviesPath)) {
      updateStep(stepIdx, { status: 'ok', message: 'Already exists' });
    } else {
      await addRadarrRootFolder(newMoviesPath);
      updateStep(stepIdx, { status: 'ok', message: `Added ${newMoviesPath}` });
    }
  } catch (error) {
    updateStep(stepIdx, { status: 'error', message: sanitizeError(error) });
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Add Radarr root folder` });
    return;
  }
  stepIdx++;

  // Step 3: rsync files
  try {
    updateStep(stepIdx, { status: 'running' });
    setMigrationState({ currentStep: stepIdx });
    await runRsync(sourcePath, destMedia);

    // Check if cancelled
    if (getMigrationState().phase === 'cancelled') return;

    updateStep(stepIdx, { status: 'ok', message: 'Files copied successfully' });
  } catch (error) {
    if (getMigrationState().phase === 'cancelled') return;
    updateStep(stepIdx, { status: 'error', message: sanitizeError(error) });
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Copy files` });
    return;
  }
  stepIdx++;

  // Step 4: Mass update Sonarr series
  try {
    updateStep(stepIdx, { status: 'running' });
    setMigrationState({ currentStep: stepIdx });
    const series = await getSeries();
    const seriesIds = series.map((s) => s.id);
    if (seriesIds.length > 0) {
      await massUpdateSeries(seriesIds, `${destMedia}/tv`);
      updateStep(stepIdx, { status: 'ok', message: `Updated ${seriesIds.length} series` });
    } else {
      updateStep(stepIdx, { status: 'ok', message: 'No series to update' });
    }
  } catch (error) {
    updateStep(stepIdx, { status: 'error', message: sanitizeError(error) });
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Update Sonarr series` });
    return;
  }
  stepIdx++;

  // Step 5: Mass update Radarr movies
  try {
    updateStep(stepIdx, { status: 'running' });
    setMigrationState({ currentStep: stepIdx });
    const movies = await getMovies();
    const movieIds = movies.map((m) => m.id);
    if (movieIds.length > 0) {
      await massUpdateMovies(movieIds, `${destMedia}/movies`);
      updateStep(stepIdx, { status: 'ok', message: `Updated ${movieIds.length} movies` });
    } else {
      updateStep(stepIdx, { status: 'ok', message: 'No movies to update' });
    }
  } catch (error) {
    updateStep(stepIdx, { status: 'error', message: sanitizeError(error) });
    setMigrationState({ running: false, phase: 'error', error: `Failed at step: Update Radarr movies` });
    return;
  }
  stepIdx++;

  // Step 6: Remove old root folders
  try {
    updateStep(stepIdx, { status: 'running' });
    setMigrationState({ currentStep: stepIdx });

    const sonarrFolders = await getSonarrRootFolders();
    const oldSonarrFolder = sonarrFolders.find((f) => f.path === '/data/media/tv');
    if (oldSonarrFolder) {
      await deleteSonarrRootFolder(oldSonarrFolder.id);
    }

    const radarrFolders = await getRadarrRootFolders();
    const oldRadarrFolder = radarrFolders.find((f) => f.path === '/data/media/movies');
    if (oldRadarrFolder) {
      await deleteRadarrRootFolder(oldRadarrFolder.id);
    }

    updateStep(stepIdx, { status: 'ok', message: 'Old root folders removed' });
  } catch (error) {
    updateStep(stepIdx, { status: 'error', message: sanitizeError(error) });
    // Non-fatal — continue
  }
  stepIdx++;

  // Step 7 (optional): Update DATA_ROOT in .env
  if (updateDataRoot) {
    try {
      updateStep(stepIdx, { status: 'running' });
      setMigrationState({ currentStep: stepIdx });

      const { writeEnv } = await import('@/lib/env');
      const destBase = destMedia.replace(/\/media$/, '');
      writeEnv({ DATA_ROOT: destBase });

      updateStep(stepIdx, { status: 'ok', message: `DATA_ROOT set to ${destBase}` });
    } catch (error) {
      updateStep(stepIdx, { status: 'error', message: sanitizeError(error) });
    }
  }

  setMigrationState({ running: false, phase: 'complete', currentStep: -1 });
}

function runRsync(source: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure trailing slash on source to copy contents, not directory itself
    const src = source.endsWith('/') ? source : `${source}/`;

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
      // Format: "1,234,567  42%  12.34MB/s  0:01:23"
      const match = line.match(/(\d+)\s+(\d+)%\s+([\d.]+\w+\/s)\s+(\S+)/);
      if (match) {
        setMigrationState({
          rsyncProgress: {
            percentage: parseInt(match[2], 10),
            filesTransferred: 0,
            totalFiles: 0,
            speed: match[3],
            eta: match[4],
          },
        });
      }
    });

    rsync.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        // rsync warnings are not always fatal
        console.error(`[migration] rsync stderr: ${msg}`);
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
      reject(err);
    });
  });
}
