'use client';

import { useState } from 'react';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';
import type { EnvVarDef } from '@/lib/env-schema';
import { cn } from '@/lib/utils';

interface EnvFieldProps {
  def: EnvVarDef;
  value: string;
  onChange: (key: string, value: string) => void;
  error?: string;
  dirty?: boolean;
}

export function EnvField({ def, value, onChange, error, dirty }: EnvFieldProps) {
  const [revealed, setRevealed] = useState(false);

  const inputClasses = cn(
    'w-full rounded-md border bg-background px-3 py-2 font-mono text-sm transition-colors focus:outline-none focus:ring-1',
    error
      ? 'border-danger focus:border-danger focus:ring-danger'
      : dirty
        ? 'border-primary focus:border-primary focus:ring-primary'
        : 'border-input focus:border-primary focus:ring-primary'
  );

  return (
    <div>
      <label htmlFor={def.key} className="mb-1 flex items-center gap-2 text-sm font-medium">
        {def.label}
        {def.required && <span className="text-danger text-xs">*</span>}
        {dirty && <span className="text-xs text-primary">(modified)</span>}
      </label>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {def.description}
        {def.servicePort && (
          <>
            {' · '}
            <a
              href={`http://localhost:${def.servicePort}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Open UI <ExternalLink className="inline h-3 w-3" />
            </a>
          </>
        )}
      </p>

      {def.type === 'select' && def.options ? (
        <select
          id={def.key}
          value={value}
          onChange={(e) => onChange(def.key, e.target.value)}
          className={inputClasses}
        >
          <option value="">Select...</option>
          {def.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : def.type === 'secret' || def.sensitive ? (
        <div className="relative">
          <input
            id={def.key}
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(def.key, e.target.value)}
            className={cn(inputClasses, 'pr-10')}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <input
          id={def.key}
          type={def.type === 'port' || def.type === 'integer' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(def.key, e.target.value)}
          placeholder={def.default || ''}
          className={inputClasses}
        />
      )}

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
