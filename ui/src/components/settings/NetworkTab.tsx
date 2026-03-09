'use client';

import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { EnvField } from './EnvField';
import type { useEnvSettings } from '@/hooks/useEnvSettings';
import { getSchemaByGroup } from '@/lib/env-schema';

interface NetworkTabProps {
  env: ReturnType<typeof useEnvSettings>;
}

export function NetworkTab({ env }: NetworkTabProps) {
  const fields = getSchemaByGroup('network');
  const subnets = fields.filter((f) => !f.key.startsWith('PORT_'));
  const ports = fields.filter((f) => f.key.startsWith('PORT_'));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Subnets</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-muted-foreground">
          Docker and local network subnets. Changing the Docker subnet requires a full stack restart.
        </p>
        <div className="space-y-4">
          {subnets.map((def) => (
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

      <Card>
        <CardHeader>
          <CardTitle>Service Ports</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-muted-foreground">
          Web UI ports for each service. Ensure no conflicts with other services on your system.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ports.map((def) => (
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
