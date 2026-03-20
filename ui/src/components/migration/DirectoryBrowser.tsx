'use client';

import { useState, useEffect } from 'react';
import { Folder, ChevronRight, ArrowUp, Loader2 } from 'lucide-react';

interface DirectoryBrowserProps {
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function DirectoryBrowser({ onSelect, onClose }: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDir = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/migration/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        setError('Failed to browse directory');
        return;
      }
      const data = await res.json();
      setDirs(data.dirs);
      setCurrentPath(data.path);
    } catch {
      setError('Failed to browse directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDir('/');
  }, []);

  const navigateTo = (dir: string) => {
    const newPath = currentPath === '/' ? `/${dir}` : `${currentPath}/${dir}`;
    loadDir(newPath);
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDir(parent);
  };

  const breadcrumbs = currentPath === '/' ? ['/'] : ['/', ...currentPath.split('/').filter(Boolean)];

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs">
        {breadcrumbs.map((crumb, i) => {
          const path = i === 0 ? '/' : '/' + breadcrumbs.slice(1, i + 1).join('/');
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <button
                onClick={() => loadDir(path)}
                className="rounded px-1 py-0.5 text-primary hover:bg-muted"
              >
                {crumb}
              </button>
            </span>
          );
        })}
      </div>

      {/* Directory listing */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">{error}</div>
        ) : (
          <div className="py-1">
            {currentPath !== '/' && (
              <button
                onClick={navigateUp}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                <ArrowUp className="h-3.5 w-3.5" />
                ..
              </button>
            )}
            {dirs.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No subdirectories
              </div>
            )}
            {dirs.map((dir) => (
              <button
                key={dir}
                onClick={() => navigateTo(dir)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
              >
                <Folder className="h-3.5 w-3.5 text-primary" />
                {dir}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <p className="truncate text-xs text-muted-foreground">{currentPath}</p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(currentPath)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Select This Folder
          </button>
        </div>
      </div>
    </div>
  );
}
