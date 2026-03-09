'use client';

import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TabDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SettingsTabsProps {
  tabs: TabDef[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function SettingsTabs({ tabs, activeTab, onChange }: SettingsTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
