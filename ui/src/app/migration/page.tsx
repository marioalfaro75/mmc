'use client';

import { useState } from 'react';
import { HardDrive, Info, ChevronDown, ChevronUp, FolderTree, FolderOpen, Network } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { MountSetup } from '@/components/migration/MountSetup';
import { LocalDirSetup } from '@/components/migration/LocalDirSetup';
import { MediaMigration } from '@/components/migration/MediaMigration';

type MigrationType = 'nas' | 'local';

export default function MigrationPage() {
  const [migrationType, setMigrationType] = useState<MigrationType>('nas');
  const [mountPoint, setMountPoint] = useState<string | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const handleTypeChange = (type: MigrationType) => {
    setMigrationType(type);
    setMountPoint(null);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <HardDrive className="h-6 w-6" />
          Media Migration
        </h1>
        <p className="mt-1 text-muted-foreground">
          Move your media library to a different location. Choose a NAS/network share or a local directory.
        </p>
      </div>

      {/* How It Works */}
      <Card>
        <button
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="w-full"
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                How It Works
              </span>
              {showHowItWorks ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
        </button>
        {showHowItWorks && (
          <div className="px-6 pb-6 space-y-4 text-sm">
            <p>
              When you migrate, the new location replaces your local <code className="rounded bg-muted px-1.5 py-0.5">DATA_ROOT</code> directory.
              Your media stack uses a specific folder structure to keep movies and TV shows separate:
            </p>

            <div className="rounded-md bg-muted p-4 font-mono text-xs space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FolderTree className="h-4 w-4 shrink-0" />
                <span>New location (DATA_ROOT)</span>
              </div>
              <div className="ml-6 space-y-0.5">
                <p>media/</p>
                <p className="ml-4 text-primary">movies/ <span className="text-muted-foreground">-- Radarr puts completed movies here</span></p>
                <p className="ml-4 text-primary">tv/ <span className="text-muted-foreground">-- Sonarr puts completed TV shows here</span></p>
                <p>torrents/</p>
                <p className="ml-4 text-muted-foreground">movies/ -- qBittorrent downloads movies here</p>
                <p className="ml-4 text-muted-foreground">tv/ -- qBittorrent downloads TV here</p>
                <p>usenet/</p>
                <p className="ml-4 text-muted-foreground">movies/ -- SABnzbd downloads movies here</p>
                <p className="ml-4 text-muted-foreground">tv/ -- SABnzbd downloads TV here</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium">How files get routed automatically:</p>
              <ol className="list-decimal ml-5 space-y-1.5 text-muted-foreground">
                <li>
                  <span className="text-foreground">Sonarr</span> tells the download client to grab a TV show.
                  It downloads to <code className="rounded bg-muted px-1 py-0.5">torrents/tv</code> or <code className="rounded bg-muted px-1 py-0.5">usenet/tv</code>.
                </li>
                <li>
                  When the download finishes, <span className="text-foreground">Sonarr automatically moves</span> the file to <code className="rounded bg-muted px-1 py-0.5">media/tv/</code> and renames it.
                </li>
                <li>
                  <span className="text-foreground">Radarr</span> does the same thing for movies, moving completed downloads to <code className="rounded bg-muted px-1 py-0.5">media/movies/</code>.
                </li>
              </ol>
            </div>

            <div className="rounded-md bg-primary/5 border border-primary/10 p-3 space-y-1.5">
              <p className="font-medium text-foreground">What the migration does:</p>
              <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                <li>Copies your existing media files from local storage to the new location</li>
                <li>Updates Sonarr and Radarr root folders to point to the new path</li>
                <li>Optionally updates <code className="rounded bg-muted px-1 py-0.5">DATA_ROOT</code> so new downloads also go to the new location</li>
                <li>All future downloads are automatically routed to the correct folder</li>
              </ul>
            </div>

            <p className="text-muted-foreground">
              The destination should be empty or already have this folder structure. The migration tool will create the folders if they don&apos;t exist.
              If the destination uses different folder names, rename them to <code className="rounded bg-muted px-1 py-0.5">movies</code> and <code className="rounded bg-muted px-1 py-0.5">tv</code> before migrating.
            </p>
          </div>
        )}
      </Card>

      {/* Migration Type Selector */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Step 1: Choose Destination</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleTypeChange('nas')}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors',
              migrationType === 'nas'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            )}
          >
            <Network className={cn('h-5 w-5', migrationType === 'nas' ? 'text-primary' : 'text-muted-foreground')} />
            <div>
              <p className="text-sm font-medium">NAS / Network Share</p>
              <p className="text-xs text-muted-foreground">SMB or NFS share on your network</p>
            </div>
          </button>
          <button
            onClick={() => handleTypeChange('local')}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors',
              migrationType === 'local'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            )}
          >
            <FolderOpen className={cn('h-5 w-5', migrationType === 'local' ? 'text-primary' : 'text-muted-foreground')} />
            <div>
              <p className="text-sm font-medium">Local Directory</p>
              <p className="text-xs text-muted-foreground">Another drive or path on this machine</p>
            </div>
          </button>
        </div>
      </div>

      {/* Phase 1: Setup */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Step 2: {migrationType === 'nas' ? 'Mount NAS' : 'Select Directory'}
        </h2>
        {migrationType === 'nas' ? (
          <MountSetup onMountVerified={setMountPoint} />
        ) : (
          <LocalDirSetup onVerified={setMountPoint} />
        )}
      </div>

      {/* Phase 2: Media Migration */}
      {mountPoint && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Step 3: Migrate Media</h2>
          <MediaMigration mountPoint={mountPoint} />
        </div>
      )}
    </div>
  );
}
