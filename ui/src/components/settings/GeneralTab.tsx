'use client';

import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { EnvField } from './EnvField';
import type { useEnvSettings } from '@/hooks/useEnvSettings';
import { getSchemaByGroup } from '@/lib/env-schema';

interface GeneralTabProps {
  env: ReturnType<typeof useEnvSettings>;
}

export function GeneralTab({ env }: GeneralTabProps) {
  const [darkMode, setDarkMode] = useState(true);
  const fields = getSchemaByGroup('general');

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark', !darkMode);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Dark Mode</p>
            <p className="text-xs text-muted-foreground">Toggle between dark and light themes</p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {darkMode ? 'Dark' : 'Light'}
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
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
