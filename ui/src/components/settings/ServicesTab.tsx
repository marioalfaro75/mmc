'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { EnvField } from './EnvField';
import type { useEnvSettings } from '@/hooks/useEnvSettings';
import { getSchemaByGroup } from '@/lib/env-schema';

interface ServicesTabProps {
  env: ReturnType<typeof useEnvSettings>;
}

export function ServicesTab({ env }: ServicesTabProps) {
  const [imagesExpanded, setImagesExpanded] = useState(false);

  const serviceFields = getSchemaByGroup('services');
  const imageFields = getSchemaByGroup('images');

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
