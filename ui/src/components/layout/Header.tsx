'use client';

import { Film, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Header() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2 md:hidden">
        <Film className="h-5 w-5 text-primary" />
        <span className="font-semibold">Mars Media Centre</span>
      </div>
      <div className="hidden md:block" />
      <button
        onClick={() => setDark(!dark)}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Toggle theme"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </header>
  );
}
