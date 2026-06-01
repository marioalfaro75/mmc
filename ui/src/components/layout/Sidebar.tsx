'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { fetchApi } from '@/lib/utils/fetchApi';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requiresAdmin?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/movies', label: 'Movies', icon: Film, requiresAdmin: true },
  { href: '/tv', label: 'TV Shows', icon: Tv, requiresAdmin: true },
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/requests', label: 'Requests', icon: MessageSquare },
  { href: '/system', label: 'System', icon: Activity, requiresAdmin: true },
  { href: '/network', label: 'Network', icon: Network, requiresAdmin: true },
  { href: '/settings', label: 'Settings', icon: Settings, requiresAdmin: true },
  { href: '/migration', label: 'Migration', icon: HardDrive, requiresAdmin: true },
  { href: '/logs', label: 'Logs', icon: ScrollText, requiresAdmin: true },
  { href: '/guide', label: 'Guide', icon: BookOpen, requiresAdmin: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, hasAdmins } = useAuth();

  // Fetch PLEX_URL from .env on disk (not process.env baked in at
  // container start). After the user changes it in Settings → Services,
  // the save flow invalidates this query, so the link updates without
  // needing a media-ui restart.
  const { data: plexData } = useQuery<{ plexUrl: string | null }>({
    queryKey: ['plex-url'],
    queryFn: () => fetchApi<{ plexUrl: string | null }>('/api/settings/plex-url'),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const plexUrl = plexData?.plexUrl ?? undefined;

  // Convert internal Docker URL to localhost for browser access. Treat
  // the wizard's placeholder default as "not configured" so the link
  // doesn't appear at all until the user enters a real URL.
  const plexWebUrl =
    plexUrl && plexUrl !== 'http://localhost:32400' && plexUrl !== 'http://host.docker.internal:32400'
      ? `${plexUrl}/web`
      : null;

  // Show all items if no admins configured yet (backwards compatible)
  const visibleItems = hasAdmins
    ? navItems.filter(item => !item.requiresAdmin || isAdmin)
    : navItems;

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        <span className="text-lg font-semibold">Mars Media Centre</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {visibleItems.map((item) => {
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
