'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { EnvField } from './EnvField';
import type { useEnvSettings } from '@/hooks/useEnvSettings';
import { getSchemaByGroup } from '@/lib/env-schema';

interface ServicesTabProps {
  env: ReturnType<typeof useEnvSettings>;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

const SERVICE_CONNECTIONS = [
  { name: 'Sonarr', envUrl: 'SONARR_URL', envKey: 'SONARR_API_KEY', testEndpoint: '/api/health', description: 'TV show management' },
  { name: 'Radarr', envUrl: 'RADARR_URL', envKey: 'RADARR_API_KEY', testEndpoint: '/api/health', description: 'Movie management' },
  { name: 'Prowlarr', envUrl: 'PROWLARR_URL', envKey: 'PROWLARR_API_KEY', testEndpoint: '/api/health', description: 'Indexer management' },
  { name: 'qBittorrent', envUrl: 'QBITTORRENT_URL', envKey: 'QBITTORRENT_PASSWORD', testEndpoint: '/api/health', description: 'Torrent client' },
  { name: 'SABnzbd', envUrl: 'SABNZBD_URL', envKey: 'SABNZBD_API_KEY', testEndpoint: '/api/health', description: 'Usenet client' },
  { name: 'Plex', envUrl: 'PLEX_URL', envKey: 'PLEX_TOKEN', testEndpoint: '/api/health', description: 'Media server' },
  { name: 'Seerr', envUrl: 'SEERR_URL', envKey: 'SEERR_API_KEY', testEndpoint: '/api/health', description: 'Request management' },
  { name: 'Tautulli', envUrl: 'TAUTULLI_URL', envKey: 'TAUTULLI_API_KEY', testEndpoint: '/api/health', description: 'Plex monitoring' },
  { name: 'Gluetun', envUrl: 'GLUETUN_URL', envKey: '', testEndpoint: '/api/vpn', description: 'VPN gateway' },
];

export function ServicesTab({ env }: ServicesTabProps) {
  const [testResults, setTestResults] = useState<Record<string, TestStatus>>({});
  const [imagesExpanded, setImagesExpanded] = useState(false);

  const serviceFields = getSchemaByGroup('services');
  const imageFields = getSchemaByGroup('images');

  const testConnection = async (service: typeof SERVICE_CONNECTIONS[0]) => {
    setTestResults((prev) => ({ ...prev, [service.name]: 'testing' }));
    try {
      const res = await fetch(service.testEndpoint);
      const data = await res.json();
      const isHealthy = data.services?.some(
        (s: { name: string; status: string }) =>
          s.name.toLowerCase() === service.name.toLowerCase() && s.status === 'online'
      ) ?? (data.connected !== undefined ? data.connected : res.ok);
      setTestResults((prev) => ({ ...prev, [service.name]: isHealthy ? 'success' : 'error' }));
    } catch {
      setTestResults((prev) => ({ ...prev, [service.name]: 'error' }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Service-specific settings */}
      <Card>
        <CardHeader>
          <CardTitle>Service Settings</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          {serviceFields.map((def) => (
            <EnvField
              key={def.key}
              def={def}
              value={env.getVar(def.key)}
              onChange={env.setVar}
              error={env.validationErrors[def.key]}
              dirty={def.key in env.dirtyVars}
            />
          ))}
        </div>
      </Card>

      {/* Service connections */}
      <Card>
        <CardHeader>
          <CardTitle>Service Connections</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-muted-foreground">
          Test connectivity to each service. Connection details are configured via environment variables.
        </p>
        <div className="space-y-3">
          {SERVICE_CONNECTIONS.map((service) => {
            const status = testResults[service.name] || 'idle';
            return (
              <div
                key={service.name}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{service.name}</p>
                    <Badge variant="outline">{service.description}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{service.envUrl}</span>
                    {service.envKey && (
                      <span> / <span className="font-mono">{service.envKey}</span></span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status === 'success' && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {status === 'error' && <XCircle className="h-4 w-4 text-danger" />}
                  {status === 'testing' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <button
                    onClick={() => testConnection(service)}
                    disabled={status === 'testing'}
                    className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Test
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Image tags (collapsible) */}
      <Card>
        <button
          onClick={() => setImagesExpanded(!imagesExpanded)}
          className="flex w-full items-center gap-2"
        >
          {imagesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CardTitle>Docker Image Tags</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">
            Pin versions or use &quot;latest&quot;
          </span>
        </button>
        {imagesExpanded && (
          <div className="mt-4 space-y-4">
            {imageFields.map((def) => (
              <EnvField
                key={def.key}
                def={def}
                value={env.getVar(def.key)}
                onChange={env.setVar}
                error={env.validationErrors[def.key]}
                dirty={def.key in env.dirtyVars}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
