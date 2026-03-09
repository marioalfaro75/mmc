'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Badge } from '@/components/common/Badge';

interface RestartConfirmModalProps {
  open: boolean;
  onClose: () => void;
  affectedServices: string[];
  onConfirm: (services: string[]) => void;
  restarting?: boolean;
}

export function RestartConfirmModal({
  open,
  onClose,
  affectedServices,
  onConfirm,
  restarting,
}: RestartConfirmModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(affectedServices));

  // Reset selection when modal opens with new services
  const toggleService = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const hasVpn = selected.has('gluetun');

  return (
    <Modal open={open} onClose={onClose} title="Restart Services">
      <p className="mb-3 text-sm text-muted-foreground">
        The following services need to be restarted to apply your changes.
        Uncheck any you&apos;d like to skip.
      </p>

      {hasVpn && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs text-warning">
            VPN gateway (gluetun) will restart first. Download clients will be briefly unavailable
            while the VPN reconnects.
          </p>
        </div>
      )}

      <div className="mb-4 space-y-1.5">
        {affectedServices.map((name) => (
          <label
            key={name}
            className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-muted/50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(name)}
              onChange={() => toggleService(name)}
              disabled={restarting}
              className="rounded border-input"
            />
            <span className="font-medium">{name}</span>
            {name === 'gluetun' && <Badge variant="outline">restarts first</Badge>}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={restarting || selected.size === 0}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {restarting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Restarting...
            </>
          ) : (
            `Restart ${selected.size} service${selected.size !== 1 ? 's' : ''}`
          )}
        </button>
        <button
          onClick={onClose}
          disabled={restarting}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Skip Restart
        </button>
      </div>
    </Modal>
  );
}
