'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Film,
  Tv,
  Download,
  CalendarDays,
  MessageSquare,
  Activity,
  Network,
  Settings,
  ScrollText,
  BookOpen,
  ExternalLink,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/movies', label: 'Movies', icon: Film },
  { href: '/tv', label: 'TV Shows', icon: Tv },
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/requests', label: 'Requests', icon: MessageSquare },
  { href: '/system', label: 'System', icon: Activity },
  { href: '/network', label: 'Network', icon: Network },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/migration', label: 'Migration', icon: HardDrive },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/guide', label: 'Guide', icon: BookOpen },
];

interface SidebarProps {
  plexUrl?: string;
}

export function Sidebar({ plexUrl }: SidebarProps) {
  const pathname = usePathname();

  // Convert internal Docker URL to localhost for browser access
  const plexWebUrl = plexUrl && plexUrl !== 'http://localhost:32400'
    ? `${plexUrl}/web`
    : plexUrl ? `${plexUrl}/web` : null;

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Film className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">Mars Media Centre</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {plexWebUrl && (
          <a
            href={plexWebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Plex
          </a>
        )}
      </nav>
    </aside>
  );
}
