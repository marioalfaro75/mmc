'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { toast } from 'sonner';

interface QbtPrefs {
  max_active_downloads: number;
  max_active_uploads: number;
  max_active_torrents: number;
  dl_limit: number;
  up_limit: number;
  max_ratio: number;
  max_seeding_time: number;
}

const FIELDS: { key: keyof QbtPrefs; label: string; description: string; unit?: string; unlimitedValue: number }[] = [
  { key: 'max_active_downloads', label: 'Max Active Downloads', description: 'Maximum number of torrents downloading simultaneously', unlimitedValue: -1 },
  { key: 'max_active_uploads', label: 'Max Active Uploads', description: 'Maximum number of torrents uploading simultaneously', unlimitedValue: -1 },
  { key: 'max_active_torrents', label: 'Max Active Torrents', description: 'Maximum total active torrents (downloading + uploading)', unlimitedValue: -1 },
  { key: 'dl_limit', label: 'Download Speed Limit', description: 'Global download speed limit (0 = unlimited)', unit: 'KB/s', unlimitedValue: 0 },
  { key: 'up_limit', label: 'Upload Speed Limit', description: 'Global upload speed limit (0 = unlimited)', unit: 'KB/s', unlimitedValue: 0 },
  { key: 'max_ratio', label: 'Max Seed Ratio', description: 'Stop seeding when ratio reaches this value (-1 = unlimited)', unlimitedValue: -1 },
  { key: 'max_seeding_time', label: 'Max Seed Time', description: 'Stop seeding after this duration (-1 = unlimited)', unit: 'minutes', unlimitedValue: -1 },
];

export function DownloadsTab() {
  const [prefs, setPrefs] = useState<QbtPrefs | null>(null);
  const [original, setOriginal] = useState<QbtPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/qbittorrent/preferences')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((data) => {
        setPrefs(data);
        setOriginal(data);
        setError(null);
      })
      .catch(() => setError('Could not connect to qBittorrent — is it running?'))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = prefs && original && JSON.stringify(prefs) !== JSON.stringify(original);

  const handleSave = async () => {
    if (!prefs || !original) return;
    setSaving(true);
    try {
      // Only send changed fields
      const changed: Record<string, unknown> = {};
      for (const key of Object.keys(prefs) as (keyof QbtPrefs)[]) {
        if (prefs[key] !== original[key]) changed[key] = prefs[key];
      }
      const res = await fetch('/api/qbittorrent/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      });
      if (!res.ok) throw new Error();
      setOriginal({ ...prefs });
      toast.success('qBittorrent preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const displayValue = (field: typeof FIELDS[number], value: number): string => {
    if (field.unit === 'KB/s') return String(value === 0 ? 0 : Math.round(value / 1024));
    if (field.key === 'max_ratio') return value === -1 ? '-1' : value.toFixed(1);
    return String(value);
  };

  const parseValue = (field: typeof FIELDS[number], input: string): number => {
    const num = parseFloat(input);
    if (isNaN(num)) return field.unlimitedValue;
    if (field.unit === 'KB/s') return Math.round(num * 1024);
    if (field.key === 'max_ratio') return num;
    return Math.round(num);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !prefs) {
    return (
      <Card>
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {error || 'Could not load qBittorrent preferences'}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Queue Limits</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-muted-foreground">
          Control how many torrents can be active at once. Set to -1 for unlimited.
        </p>
        <div className="space-y-4">
          {FIELDS.filter((f) => f.key.startsWith('max_active')).map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={displayValue(field, prefs[field.key])}
              onChange={(v) => setPrefs({ ...prefs, [field.key]: parseValue(field, v) })}
              dirty={prefs[field.key] !== original![field.key]}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Speed Limits</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-muted-foreground">
          Global bandwidth limits for all torrents. Set to 0 for unlimited.
        </p>
        <div className="space-y-4">
          {FIELDS.filter((f) => f.key.endsWith('_limit')).map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={displayValue(field, prefs[field.key])}
              onChange={(v) => setPrefs({ ...prefs, [field.key]: parseValue(field, v) })}
              dirty={prefs[field.key] !== original![field.key]}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seeding Limits</CardTitle>
        </CardHeader>
        <p className="mb-4 text-xs text-muted-foreground">
          Stop seeding automatically when these limits are reached. Set to -1 for unlimited.
        </p>
        <div className="space-y-4">
          {FIELDS.filter((f) => f.key.startsWith('max_ratio') || f.key.startsWith('max_seeding')).map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={displayValue(field, prefs[field.key])}
              onChange={(v) => setPrefs({ ...prefs, [field.key]: parseValue(field, v) })}
              dirty={prefs[field.key] !== original![field.key]}
            />
          ))}
        </div>
      </Card>

      {isDirty && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Preferences
          </button>
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  dirty,
}: {
  field: typeof FIELDS[number];
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">{field.label}</label>
        {dirty && <span className="text-xs text-primary">(modified)</span>}
      </div>
      <p className="mb-1.5 text-xs text-muted-foreground">{field.description}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={field.key === 'max_ratio' ? '0.1' : '1'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-32 rounded-md border bg-background px-3 py-1.5 text-sm ${
            dirty ? 'border-primary' : 'border-input'
          }`}
        />
        {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
      </div>
    </div>
  );
}
