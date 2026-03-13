'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

interface LogViewerModalProps {
  open: boolean;
  onClose: () => void;
  serviceName: string;
}

const LINE_OPTIONS = [50, 100, 200, 500];

export function LogViewerModal({ open, onClose, serviceName }: LogViewerModalProps) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState(100);
  const scrollRef = useRef<HTMLPreElement>(null);

  const fetchLogs = async () => {
    if (!serviceName) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/services/${serviceName}/logs?lines=${lines}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      } else {
        setLogs('Failed to fetch logs');
      }
    } catch {
      setLogs('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && serviceName) {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serviceName, lines]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Modal open={open} onClose={onClose} title={`Logs — ${serviceName}`} className="max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex items-center gap-1">
          {LINE_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setLines(n)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                lines === n
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-input hover:bg-muted'
              }`}
            >
              {n}
            </button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">lines</span>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>
      <pre
        ref={scrollRef}
        className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
      >
        {loading && !logs ? 'Loading...' : logs || 'No logs available'}
      </pre>
    </Modal>
  );
}
