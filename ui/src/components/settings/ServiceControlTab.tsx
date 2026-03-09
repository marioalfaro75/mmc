'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, Square, RotateCcw, ScrollText, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { toast } from 'sonner';
import { POLLING } from '@/lib/utils/polling';
import { LogViewerModal } from './LogViewerModal';
import type { DockerServiceStatus } from '@/lib/types/common';

export function ServiceControlTab() {
  const [services, setServices] = useState<DockerServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<Record<string, string>>({});
  const [logService, setLogService] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    try {
      const res = await fetch('/api/services');
      if (res.ok) {
        const data = await res.json();
        setServices(data.services);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
    const interval = setInterval(loadServices, POLLING.SERVICES);
    return () => clearInterval(interval);
  }, [loadServices]);

  const performAction = async (service: string, action: 'restart' | 'stop' | 'start') => {
    setActionInProgress((prev) => ({ ...prev, [service]: action }));
    try {
      const res = await fetch(`/api/services/${service}/${action}`, { method: 'POST' });
      if (res.ok) {
        toast.success(`${service} ${action}ed`);
        // Reload after brief delay
        setTimeout(loadServices, 1000);
      } else {
        const data = await res.json();
        toast.error(data.error || `Failed to ${action} ${service}`);
      }
    } catch {
      toast.error(`Failed to ${action} ${service}`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[service];
        return next;
      });
    }
  };

  const restartAll = async () => {
    try {
      const res = await fetch('/api/settings/restart', { method: 'POST' });
      if (res.ok) {
        toast.info('Restarting all services...');
        // Poll until services come back
        const poll = setInterval(async () => {
          try {
            const healthRes = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
            if (healthRes.ok) {
              clearInterval(poll);
              toast.success('All services restarted');
              loadServices();
            }
          } catch {
            // expected
          }
        }, 3000);
        setTimeout(() => clearInterval(poll), 120000);
      }
    } catch {
      toast.error('Failed to restart stack');
    }
  };

  const getStateBadge = (svc: DockerServiceStatus) => {
    if (svc.state === 'running' && svc.health === 'healthy') return <Badge variant="success">Healthy</Badge>;
    if (svc.state === 'running' && svc.health === 'none') return <Badge variant="success">Running</Badge>;
    if (svc.state === 'running' && svc.health === 'starting') return <Badge variant="warning">Starting</Badge>;
    if (svc.state === 'running' && svc.health === 'unhealthy') return <Badge variant="danger">Unhealthy</Badge>;
    if (svc.state === 'exited') return <Badge variant="danger">Stopped</Badge>;
    if (svc.state === 'restarting') return <Badge variant="warning">Restarting</Badge>;
    return <Badge variant="outline">{svc.state}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Service Control</CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={loadServices}
              className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={restartAll}
              className="flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger/90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restart All
            </button>
          </div>
        </CardHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : services.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No services found. Is Docker running?
          </p>
        ) : (
          <div className="space-y-2">
            {services.map((svc) => {
              const action = actionInProgress[svc.service];
              const isRunning = svc.state === 'running';
              const isSelf = svc.service === 'media-ui';

              return (
                <div
                  key={svc.service}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{svc.service}</p>
                      {getStateBadge(svc)}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {svc.status}
                      {svc.image && ` — ${svc.image}`}
                    </p>
                  </div>

                  <div className="ml-4 flex items-center gap-1.5">
                    <button
                      onClick={() => setLogService(svc.service)}
                      className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="View logs"
                    >
                      <ScrollText className="h-3.5 w-3.5" />
                    </button>

                    {isRunning ? (
                      <>
                        <button
                          onClick={() => performAction(svc.service, 'restart')}
                          disabled={!!action}
                          className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title="Restart"
                        >
                          {action === 'restart' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => performAction(svc.service, 'stop')}
                            disabled={!!action}
                            className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-danger disabled:opacity-50"
                            title="Stop"
                          >
                            {action === 'stop' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => performAction(svc.service, 'start')}
                        disabled={!!action}
                        className="rounded-md border border-input p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-success disabled:opacity-50"
                        title="Start"
                      >
                        {action === 'start' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <LogViewerModal
        open={!!logService}
        onClose={() => setLogService(null)}
        serviceName={logService || ''}
      />
    </div>
  );
}
