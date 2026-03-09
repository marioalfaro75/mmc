'use client';

import { useEffect, useState } from 'react';
import { Shield, ShieldCheck, ShieldX } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { EnvField } from './EnvField';
import type { useEnvSettings } from '@/hooks/useEnvSettings';
import { getSchemaByGroup } from '@/lib/env-schema';

interface VpnTabProps {
  env: ReturnType<typeof useEnvSettings>;
}

interface VpnStatus {
  connected: boolean;
  ip: string | null;
  country: string | null;
}

export function VpnTab({ env }: VpnTabProps) {
  const fields = getSchemaByGroup('vpn');
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);

  useEffect(() => {
    fetch('/api/vpn')
      .then((r) => r.json())
      .then(setVpnStatus)
      .catch(() => setVpnStatus(null));
  }, []);

  return (
    <div className="space-y-6">
      {/* VPN status banner */}
      <Card className={vpnStatus?.connected ? 'border-success/50' : 'border-danger/50'}>
        <div className="flex items-center gap-3">
          {vpnStatus?.connected ? (
            <ShieldCheck className="h-5 w-5 text-success" />
          ) : vpnStatus === null ? (
            <Shield className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ShieldX className="h-5 w-5 text-danger" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium">
              VPN {vpnStatus?.connected ? 'Connected' : vpnStatus === null ? 'Unknown' : 'Disconnected'}
            </p>
            {vpnStatus?.ip && (
              <p className="text-xs text-muted-foreground">
                IP: {vpnStatus.ip}
                {vpnStatus.country && ` — ${vpnStatus.country}`}
              </p>
            )}
          </div>
          <Badge variant={vpnStatus?.connected ? 'success' : vpnStatus === null ? 'outline' : 'danger'}>
            {vpnStatus?.connected ? 'Online' : vpnStatus === null ? 'Unknown' : 'Offline'}
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
              onChange={env.setVar}
              error={env.validationErrors[def.key]}
              dirty={def.key in env.dirtyVars}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
