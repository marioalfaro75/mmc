'use client';

import { useState } from 'react';
import { Settings, Sliders, Shield, Network, Server, Container, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsTabs, type TabDef } from '@/components/settings/SettingsTabs';
import { GeneralTab } from '@/components/settings/GeneralTab';
import { VpnTab } from '@/components/settings/VpnTab';
import { NetworkTab } from '@/components/settings/NetworkTab';
import { ServicesTab } from '@/components/settings/ServicesTab';
import { ServiceControlTab } from '@/components/settings/ServiceControlTab';
import { RestartConfirmModal } from '@/components/settings/RestartConfirmModal';
import { useEnvSettings } from '@/hooks/useEnvSettings';

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'vpn', label: 'VPN', icon: Shield },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'services', label: 'Services', icon: Server },
  { id: 'control', label: 'Service Control', icon: Container },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const env = useEnvSettings();
  const [restartModalOpen, setRestartModalOpen] = useState(false);
  const [affectedServices, setAffectedServices] = useState<string[]>([]);
  const [restarting, setRestarting] = useState(false);

  const handleSave = async () => {
    // Validate first
    const { valid, affectedServices: affected } = await env.validate();
    if (!valid) {
      toast.error('Please fix validation errors before saving');
      return;
    }

    // Save the changes
    const { success, affectedServices: savedAffected } = await env.save();
    if (!success) {
      toast.error('Failed to save settings');
      return;
    }

    toast.success('Settings saved');

    // Show restart modal if services are affected
    const services = savedAffected.length > 0 ? savedAffected : affected;
    if (services.length > 0) {
      setAffectedServices(services);
      setRestartModalOpen(true);
    }
  };

  const handleRestart = async (services: string[]) => {
    setRestarting(true);
    try {
      const res = await fetch('/api/settings/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services }),
      });
      if (res.ok) {
        toast.success(`Restarting ${services.length} service${services.length !== 1 ? 's' : ''}...`);
        setRestartModalOpen(false);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Restart failed');
      }
    } catch {
      toast.error('Failed to trigger restart');
    } finally {
      setRestarting(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <SettingsTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        {env.loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {activeTab === 'general' && <GeneralTab env={env} />}
            {activeTab === 'vpn' && <VpnTab env={env} />}
            {activeTab === 'network' && <NetworkTab env={env} />}
            {activeTab === 'services' && <ServicesTab env={env} />}
            {activeTab === 'control' && <ServiceControlTab />}
          </>
        )}
      </div>

      {/* Sticky save bar */}
      {env.isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-6 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <p className="text-sm text-muted-foreground">
              You have unsaved changes ({Object.keys(env.dirtyVars).length} modified)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={env.reset}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={env.saving}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {env.saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <RestartConfirmModal
        open={restartModalOpen}
        onClose={() => setRestartModalOpen(false)}
        affectedServices={affectedServices}
        onConfirm={handleRestart}
        restarting={restarting}
      />
    </>
  );
}
