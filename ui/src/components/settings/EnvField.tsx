'use client';

import { useRef, useState } from 'react';
import { Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { EnvVarDef } from '@/lib/env-schema';
import { MASKED_VALUE } from '@/lib/env-schema';
import { cn } from '@/lib/utils';
import { useBrowserHost } from '@/lib/useBrowserHost';

interface EnvFieldProps {
  def: EnvVarDef;
  value: string;
  onChange: (key: string, value: string) => void;
  /**
   * Optional: called when the reveal endpoint returns the unmasked value.
   * If supplied, the row will NOT be marked "modified" (the user only
   * looked at the value, didn't change it). If not supplied, falls back
   * to onChange — safe but marks the row dirty.
   */
  onRevealLoaded?: (key: string, value: string) => void;
  error?: string;
  dirty?: boolean;
}

export function EnvField({ def, value, onChange, onRevealLoaded, error, dirty }: EnvFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [fetching, setFetching] = useState(false);
  // Point service-link icons at the same host the browser used to reach
  // this UI — not hardcoded localhost — so they work from a phone / LAN.
  const browserHost = useBrowserHost();

  const isSensitive = def.type === 'secret' || def.sensitive;
  const isMasked = value === MASKED_VALUE;

  // Track "the field HAD a stored password when this row rendered". We
  // read it once from the initial value and hold it steady. Used to
  // restore the mask on blur when the user focused, cleared, and left
  // without typing — so an idle click doesn't accidentally set the
  // password to empty on save.
  const wasMaskedInitially = useRef(value === MASKED_VALUE);

  const inputClasses = cn(
    'w-full rounded-md border bg-background px-3 py-2 font-mono text-sm transition-colors focus:outline-none focus:ring-1',
    error
      ? 'border-danger focus:border-danger focus:ring-danger'
      : dirty
        ? 'border-primary focus:border-primary focus:ring-primary'
        : 'border-input focus:border-primary focus:ring-primary'
  );

  // Reveal button click. Three cases:
  //   1. The field currently shows the mask → hit the reveal endpoint,
  //      replace the value with the real one, flip to type=text.
  //   2. The field shows a real value (revealed OR user-typed) → just
  //      toggle input type as normal.
  //   3. Reveal endpoint says forbidden → toast and stay masked.
  const handleReveal = async () => {
    if (isMasked && !revealed) {
      setFetching(true);
      try {
        const res = await fetch(
          `/api/settings/env/reveal?key=${encodeURIComponent(def.key)}`,
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { value: string };
        (onRevealLoaded ?? onChange)(def.key, json.value);
        setRevealed(true);
      } catch (err) {
        toast.error(
          err instanceof Error && err.message.toLowerCase().includes('admin')
            ? 'Admin login required to reveal this value'
            : err instanceof Error
              ? err.message
              : 'Failed to reveal value',
        );
      } finally {
        setFetching(false);
      }
      return;
    }
    setRevealed((r) => !r);
  };

  // Editing a masked field safely. Without this, clicking into the
  // password input and typing produces `••••••••<newpass>` (the mask
  // gets prepended to the user's input), which then gets written to
  // .env as garbage. Focus-clear + blur-restore keeps the mask as an
  // affordance ("there IS a password here") while making edits work.
  const handleFocus = () => {
    if (isSensitive && isMasked) {
      onChange(def.key, '');
    }
  };
  const handleBlur = () => {
    if (isSensitive && value === '' && wasMaskedInitially.current && !revealed) {
      onChange(def.key, MASKED_VALUE);
    }
  };

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
              href={`http://${browserHost}:${def.servicePort}`}
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
      ) : isSensitive ? (
        <div className="relative">
          <input
            id={def.key}
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(def.key, e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={cn(inputClasses, 'pr-10')}
            autoComplete="off"
            placeholder={isMasked ? 'Click the eye to view or type to change' : ''}
          />
          <button
            type="button"
            onClick={handleReveal}
            disabled={fetching}
            title={
              fetching
                ? 'Fetching…'
                : isMasked && !revealed
                  ? 'Reveal (admin only)'
                  : revealed
                    ? 'Hide'
                    : 'Show'
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {fetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
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
