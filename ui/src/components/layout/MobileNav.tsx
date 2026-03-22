'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Film,
  Tv,
  Download,
  Settings,
  HardDrive,
  ScrollText,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface MobileNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requiresAdmin?: boolean;
}

const mobileItems: MobileNavItem[] = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/movies', label: 'Movies', icon: Film, requiresAdmin: true },
  { href: '/tv', label: 'TV', icon: Tv, requiresAdmin: true },
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings, requiresAdmin: true },
  { href: '/migration', label: 'NAS', icon: HardDrive, requiresAdmin: true },
  { href: '/logs', label: 'Logs', icon: ScrollText, requiresAdmin: true },
  { href: '/guide', label: 'Guide', icon: BookOpen, requiresAdmin: true },
];

export function MobileNav() {
  const pathname = usePathname();
  const { isAdmin, hasAdmins } = useAuth();

  const visibleItems = hasAdmins
    ? mobileItems.filter(item => !item.requiresAdmin || isAdmin)
    : mobileItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-surface md:hidden">
      {visibleItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
