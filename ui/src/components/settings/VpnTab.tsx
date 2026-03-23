'use client';

import { useQuery } from '@tanstack/react-query';
import { Shield, ShieldCheck, ShieldX, ShieldAlert, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { EnvField } from './EnvField';
import type { useEnvSettings } from '@/hooks/useEnvSettings';
import { getSchemaByGroup } from '@/lib/env-schema';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import type { VpnStatus } from '@/lib/types/common';

interface VpnTabProps {
  env: ReturnType<typeof useEnvSettings>;
}

/** Keys that are conditionally hidden based on provider / Secure Core state */
const SECURE_CORE_KEYS = new Set(['SECURE_CORE_ONLY', 'SERVER_HOSTNAMES']);

export function VpnTab({ env }: VpnTabProps) {
  const allFields = getSchemaByGroup('vpn');

  const { data: vpnStatus } = useQuery<VpnStatus>({
    queryKey: ['vpn'],
    queryFn: () => fetchApi<VpnStatus>('/api/vpn'),
    refetchInterval: POLLING.VPN,
    staleTime: STALE_TIME.VPN,
  });

  const provider = env.getVar('VPN_SERVICE_PROVIDER');
  const isProton = provider === 'protonvpn';
  const secureCoreOn = isProton && env.getVar('SECURE_CORE_ONLY') === 'on';

  // Filter fields based on provider and Secure Core state
  const fields = allFields.filter((def) => {
    // Only show Secure Core fields for ProtonVPN
    if (SECURE_CORE_KEYS.has(def.key) && !isProton) return false;
    // Hide SERVER_HOSTNAMES unless Secure Core is on
    if (def.key === 'SERVER_HOSTNAMES' && !secureCoreOn) return false;
    // Hide SERVER_COUNTRIES when Secure Core is on (can't use both)
    if (def.key === 'SERVER_COUNTRIES' && secureCoreOn) return false;
    return true;
  });

  // When toggling Secure Core on, clear SERVER_COUNTRIES to avoid conflicts
  // When toggling off, clear SERVER_HOSTNAMES
  const handleChange = (key: string, value: string) => {
    env.setVar(key, value);
    if (key === 'SECURE_CORE_ONLY' && value === 'on') {
      env.setVar('SERVER_COUNTRIES', '');
    } else if (key === 'SECURE_CORE_ONLY' && value === 'off') {
      env.setVar('SERVER_HOSTNAMES', '');
    }
  };

  return (
    <div className="space-y-6">
      {/* VPN status banner */}
      <Card className={
        vpnStatus?.status === 'connected' ? 'border-success/50'
          : vpnStatus?.status === 'connecting' ? 'border-warning/50'
          : vpnStatus?.status === 'error' ? 'border-danger/50'
          : !vpnStatus ? 'border-border'
          : 'border-danger/50'
      }>
        <div className="flex items-center gap-3">
          {vpnStatus?.status === 'connected' ? (
            <ShieldCheck className="h-5 w-5 text-success" />
          ) : vpnStatus?.status === 'connecting' ? (
            <Loader2 className="h-5 w-5 animate-spin text-warning" />
          ) : vpnStatus?.status === 'error' ? (
            <ShieldAlert className="h-5 w-5 text-danger" />
          ) : !vpnStatus ? (
            <Shield className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ShieldX className="h-5 w-5 text-danger" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium">
              {vpnStatus?.status === 'connected' ? 'VPN Connected'
                : vpnStatus?.status === 'connecting' ? 'VPN Connecting'
                : vpnStatus?.status === 'error' ? 'VPN Error'
                : !vpnStatus ? 'VPN Unknown'
                : 'VPN Disconnected'}
            </p>
            <p className="text-xs text-muted-foreground">
              {vpnStatus?.ip
                ? <>IP: {vpnStatus.ip}{vpnStatus.country && ` — ${vpnStatus.country}`}</>
                : vpnStatus?.statusMessage || null}
            </p>
          </div>
          <Badge variant={
            vpnStatus?.status === 'connected' ? 'success'
              : vpnStatus?.status === 'connecting' ? 'warning'
              : !vpnStatus ? 'outline'
              : 'danger'
          }>
            {vpnStatus?.status === 'connected' ? 'Online'
              : vpnStatus?.status === 'connecting' ? 'Connecting'
              : vpnStatus?.status === 'error' ? 'Error'
              : !vpnStatus ? 'Unknown'
              : 'Offline'}
          </Badge>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VPN Configuration</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-muted-foreground">
          Configure your VPN provider and credentials. Changes will restart the VPN gateway
          and dependent download clients.
        </p>
        <div className="space-y-4">
          {fields.map((def) => (
            <EnvField
              key={def.key}
              def={def}
              value={env.getVar(def.key)}
              onChange={handleChange}
              error={env.validationErrors[def.key]}
              dirty={def.key in env.dirtyVars}
            />
          ))}
        </div>

        {secureCoreOn && (
          <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Secure Core:</strong> Traffic is routed through a
            privacy-friendly entry country (Iceland, Switzerland, or Sweden) before exiting in
            the target country. Port forwarding may not be available on all Secure Core servers.
          </div>
        )}
      </Card>
    </div>
  );
}
