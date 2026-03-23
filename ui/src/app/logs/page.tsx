'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  RefreshCw,
  Server,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'services' | 'deploy';
type LogSource = 'app' | 'docker';

const TABS: { key: Tab; label: string; icon: typeof ScrollText }[] = [
  { key: 'services', label: 'Services', icon: Server },
  { key: 'deploy', label: 'Deploy', icon: Terminal },
];

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('services');
  const [lineCount, setLineCount] = useState(200);
  const [selectedService, setSelectedService] = useState('sonarr');
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
/* Service Log Tab                                                     */
/* ------------------------------------------------------------------ */
const SERVICE_LIST = [
  'sonarr', 'radarr', 'prowlarr', 'bazarr',
  'seerr', 'recyclarr', 'gluetun', 'qbittorrent', 'sabnzbd',
  'unpackerr', 'watchtower', 'media-ui',
];

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

      <div className="relative">
        {data?.logs && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(data.logs);
              toast.success('Logs copied to clipboard');
            }}
            className="absolute right-2 top-2 z-10 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Copy logs to clipboard"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="rounded-lg border border-border bg-black/50 p-3 font-mono text-xs leading-5 max-h-[70vh] overflow-auto whitespace-pre-wrap">
          {data?.logs || (
            <span className="text-muted-foreground">No logs available.</span>
          )}
        </div>
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

      <div className="relative">
        {contentQuery.data?.content && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(contentQuery.data!.content);
              toast.success('Logs copied to clipboard');
            }}
            className="absolute right-2 top-2 z-10 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Copy logs to clipboard"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
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
    </div>
  );
}
