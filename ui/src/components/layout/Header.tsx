'use client';

import { Film, Moon, Sun, LogIn, LogOut, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export function Header() {
  const [dark, setDark] = useState(true);
  const router = useRouter();
  const { isAdmin, username, hasAdmins, isLoading, logout } = useAuth();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => router.push('/'),
    });
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2 md:hidden">
        <Film className="h-5 w-5 text-primary" />
        <span className="font-semibold">Mars Media Centre</span>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isAdmin ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{username}</span>
            <button
              onClick={handleLogout}
              disabled={logout.isPending}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        ) : hasAdmins ? (
          <button
            onClick={() => router.push('/admin-login')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Admin Login"
          >
            <LogIn className="h-3.5 w-3.5" />
            Login
          </button>
        ) : null}
        <button
          onClick={() => setDark(!dark)}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
