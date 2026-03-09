'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { EnvVarDef } from '@/lib/env-schema';

interface EnvSettingsData {
  vars: Record<string, string>;
  schema: EnvVarDef[];
}

export function useEnvSettings() {
  const [data, setData] = useState<EnvSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirtyVars, setDirtyVars] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const originalVars = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/env');
      if (!res.ok) throw new Error('Failed to load settings');
      const json = await res.json();
      setData(json);
      originalVars.current = json.vars;
      setDirtyVars({});
      setValidationErrors({});
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setVar = useCallback((key: string, value: string) => {
    setDirtyVars((prev) => {
      // If value matches original, remove from dirty
      if (value === originalVars.current[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
    // Clear validation error for this key
    setValidationErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const getVar = useCallback((key: string): string => {
    if (key in dirtyVars) return dirtyVars[key];
    return data?.vars[key] ?? '';
  }, [dirtyVars, data]);

  const isDirty = Object.keys(dirtyVars).length > 0;

  const validate = useCallback(async (): Promise<{ valid: boolean; affectedServices: string[] }> => {
    try {
      const res = await fetch('/api/settings/env/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars: dirtyVars }),
      });
      const json = await res.json();
      if (!json.valid) {
        setValidationErrors(json.errors);
      }
      return { valid: json.valid, affectedServices: json.affectedServices };
    } catch {
      return { valid: false, affectedServices: [] };
    }
  }, [dirtyVars]);

  const save = useCallback(async (): Promise<{ success: boolean; affectedServices: string[] }> => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars: dirtyVars }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.errors) setValidationErrors(json.errors);
        return { success: false, affectedServices: [] };
      }
      // Reload to get fresh values
      await load();
      return { success: true, affectedServices: json.affectedServices };
    } catch {
      return { success: false, affectedServices: [] };
    } finally {
      setSaving(false);
    }
  }, [dirtyVars, load]);

  const reset = useCallback(() => {
    setDirtyVars({});
    setValidationErrors({});
  }, []);

  return {
    data,
    loading,
    error,
    dirtyVars,
    validationErrors,
    saving,
    isDirty,
    setVar,
    getVar,
    validate,
    save,
    reset,
    reload: load,
  };
}
