'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  RefreshCw,
  Server,
  Terminal,
} from 'lucide-react';

type Tab = 'app' | 'services' | 'deploy';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-muted-foreground',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const TABS: { key: Tab; label: string; icon: typeof ScrollText }[] = [
  { key: 'app', label: 'Application', icon: ScrollText },
  { key: 'services', label: 'Services', icon: Server },
  { key: 'deploy', label: 'Deploy', icon: Terminal },
];

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('app');
  const [levelFilter, setLevelFilter] = useState<LogLevel | ''>('');
  const [lineCount, setLineCount] = useState(200);
  const [selectedService, setSelectedService] = useState('gluetun');
  const [selectedDeployFile, setSelectedDeployFile] = useState('');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Logs</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'app' && (
        <AppLogTab
          levelFilter={levelFilter}
          setLevelFilter={setLevelFilter}
          lineCount={lineCount}
          setLineCount={setLineCount}
        />
      )}
      {tab === 'services' && (
        <ServiceLogTab
          selectedService={selectedService}
          setSelectedService={setSelectedService}
          lineCount={lineCount}
          setLineCount={setLineCount}
        />
      )}
      {tab === 'deploy' && (
        <DeployLogTab
          selectedFile={selectedDeployFile}
          setSelectedFile={setSelectedDeployFile}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Application Log Tab                                                 */
/* ------------------------------------------------------------------ */
function AppLogTab({
  levelFilter,
  setLevelFilter,
  lineCount,
  setLineCount,
}: {
  levelFilter: LogLevel | '';
  setLevelFilter: (v: LogLevel | '') => void;
  lineCount: number;
  setLineCount: (v: number) => void;
}) {
  const query = useQuery<{ entries: LogEntry[] }>({
    queryKey: ['app-logs', lineCount, levelFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ lines: String(lineCount) });
      if (levelFilter) params.set('level', levelFilter);
      const res = await fetch(`/api/logs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const entries = query.data?.entries || [];

  return (
    <div className="space-y-3">
      <LogToolbar
        lineCount={lineCount}
        setLineCount={setLineCount}
        onRefresh={() => query.refetch()}
        isRefreshing={query.isFetching}
      >
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as LogLevel | '')}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        >
          <option value="">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </LogToolbar>

      <div className="rounded-lg border border-border bg-black/50 p-3 font-mono text-xs leading-5 max-h-[70vh] overflow-auto">
        {entries.length === 0 ? (
          <p className="text-muted-foreground">No log entries found.</p>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="flex gap-2 hover:bg-white/5">
              <span className="text-muted-foreground shrink-0">
                {entry.timestamp.replace('T', ' ').slice(0, 19)}
              </span>
              <span className={`uppercase font-bold w-12 shrink-0 ${LEVEL_COLORS[entry.level]}`}>
                {entry.level.padEnd(5)}
              </span>
              <span className="text-purple-400 shrink-0">[{entry.component}]</span>
              <span className="text-foreground">{entry.message}</span>
              {entry.data && (
                <span className="text-muted-foreground">
                  {JSON.stringify(entry.data)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Service Log Tab                                                     */
/* ------------------------------------------------------------------ */
const SERVICE_LIST = [
  'sonarr', 'radarr', 'prowlarr', 'bazarr', 'plex', 'tautulli',
  'seerr', 'recyclarr', 'gluetun', 'qbittorrent', 'sabnzbd',
  'unpackerr', 'watchtower', 'media-ui',
];

type LogSource = 'app' | 'docker';

interface ServiceLogResponse {
  service: string;
  source: LogSource;
  logs: string;
  file?: string;
  availableFiles?: string[];
  note?: string;
}

function ServiceLogTab({
  selectedService,
  setSelectedService,
  lineCount,
  setLineCount,
}: {
  selectedService: string;
  setSelectedService: (v: string) => void;
  lineCount: number;
  setLineCount: (v: number) => void;
}) {
  const [logSource, setLogSource] = useState<LogSource>('app');
  const [selectedFile, setSelectedFile] = useState('');

  const query = useQuery<ServiceLogResponse>({
    queryKey: ['service-logs', selectedService, lineCount, logSource, selectedFile],
    queryFn: async () => {
      const params = new URLSearchParams({
        lines: String(lineCount),
        source: logSource,
      });
      if (logSource === 'app' && selectedFile) {
        params.set('file', selectedFile);
      }
      const res = await fetch(`/api/services/${selectedService}/logs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch service logs');
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const data = query.data;
  const availableFiles = data?.availableFiles || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Service picker */}
        <select
          value={selectedService}
          onChange={(e) => {
            setSelectedService(e.target.value);
            setSelectedFile('');
          }}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {SERVICE_LIST.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Source toggle */}
        <div className="flex rounded-md border border-border overflow-hidden text-sm">
          <button
            onClick={() => { setLogSource('app'); setSelectedFile(''); }}
            className={`px-3 py-1.5 ${logSource === 'app' ? 'bg-primary text-primary-foreground' : 'bg-surface hover:bg-muted'}`}
          >
            App Logs
          </button>
          <button
            onClick={() => setLogSource('docker')}
            className={`px-3 py-1.5 ${logSource === 'docker' ? 'bg-primary text-primary-foreground' : 'bg-surface hover:bg-muted'}`}
          >
            Docker
          </button>
        </div>

        {/* File picker (when app source and multiple files available) */}
        {logSource === 'app' && availableFiles.length > 1 && (
          <select
            value={selectedFile || data?.file || ''}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            {availableFiles.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        )}

        {/* Line count */}
        <select
          value={lineCount}
          onChange={(e) => setLineCount(Number(e.target.value))}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        >
          <option value={100}>100 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
        </select>

        <button
          onClick={() => query.refetch()}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Info badges */}
      {data && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5">
            Source: {data.source === 'docker' ? 'Docker container' : 'Application log file'}
          </span>
          {data.file && (
            <span className="rounded bg-muted px-2 py-0.5">{data.file}</span>
          )}
          {data.note && (
            <span className="rounded bg-yellow-900/30 text-yellow-400 px-2 py-0.5">{data.note}</span>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-black/50 p-3 font-mono text-xs leading-5 max-h-[70vh] overflow-auto whitespace-pre-wrap">
        {data?.logs || (
          <span className="text-muted-foreground">No logs available.</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deploy Log Tab                                                      */
/* ------------------------------------------------------------------ */
function DeployLogTab({
  selectedFile,
  setSelectedFile,
}: {
  selectedFile: string;
  setSelectedFile: (v: string) => void;
}) {
  const filesQuery = useQuery<{ files: { name: string }[] }>({
    queryKey: ['deploy-log-files'],
    queryFn: async () => {
      const res = await fetch('/api/logs/deploy');
      if (!res.ok) throw new Error('Failed to list deploy logs');
      return res.json();
    },
    staleTime: 30000,
  });

  const contentQuery = useQuery<{ content: string }>({
    queryKey: ['deploy-log-content', selectedFile],
    queryFn: async () => {
      const res = await fetch(`/api/logs/deploy?file=${encodeURIComponent(selectedFile)}`);
      if (!res.ok) throw new Error('Failed to fetch deploy log');
      return res.json();
    },
    enabled: !!selectedFile,
    staleTime: 30000,
  });

  const files = filesQuery.data?.files || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        >
          <option value="">Select a deploy log...</option>
          {files.map((f) => (
            <option key={f.name} value={f.name}>{f.name}</option>
          ))}
        </select>
        <button
          onClick={() => {
            filesQuery.refetch();
            if (selectedFile) contentQuery.refetch();
          }}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${filesQuery.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-lg border border-border bg-black/50 p-3 font-mono text-xs leading-5 max-h-[70vh] overflow-auto whitespace-pre-wrap">
        {!selectedFile ? (
          <p className="text-muted-foreground">Select a deploy log file to view.</p>
        ) : contentQuery.isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          contentQuery.data?.content || (
            <span className="text-muted-foreground">Log file is empty.</span>
          )
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared toolbar                                                      */
/* ------------------------------------------------------------------ */
function LogToolbar({
  lineCount,
  setLineCount,
  onRefresh,
  isRefreshing,
  children,
}: {
  lineCount: number;
  setLineCount: (v: number) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
      <select
        value={lineCount}
        onChange={(e) => setLineCount(Number(e.target.value))}
        className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
      >
        <option value={100}>100 lines</option>
        <option value={200}>200 lines</option>
        <option value={500}>500 lines</option>
        <option value={1000}>1000 lines</option>
      </select>
      <button
        onClick={onRefresh}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        title="Refresh"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
