'use client';

import { Search, Bell, LogOut, Moon, Sun } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';

interface TopBarProps {
  onSignOut: () => void;
}

export function TopBar({ onSignOut }: TopBarProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Check current theme
    const currentTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setTheme(currentTheme);

    const handleStorageChange = () => {
      const newTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
      setTheme(newTheme);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    window.dispatchEvent(new Event('storage'));
  };

  if (!isMounted) {
    return null;
  }

  return (
    <header className="bg-sidebar border-b border-sidebar-border px-6 py-4 flex items-center justify-between gap-6 flex-wrap sm:flex-nowrap">
      <div className="flex-1 flex items-center gap-4 min-w-0">
        <div className="relative w-full sm:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-foreground/40"
            strokeWidth={1.5}
          />
          <Input
            placeholder="Search worlds..."
            className="pl-10 bg-sidebar-accent/30 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:bg-sidebar-accent/50 cursor-text w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-sidebar-accent/20 rounded-lg transition-colors cursor-pointer flex-shrink-0"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun
              className="w-5 h-5 text-sidebar-foreground/60 hover:text-accent transition-colors"
              strokeWidth={1.5}
            />
          ) : (
            <Moon
              className="w-5 h-5 text-sidebar-foreground/60 hover:text-accent transition-colors"
              strokeWidth={1.5}
            />
          )}
        </button>

        <button
          onClick={onSignOut}
          className="p-2 hover:bg-sidebar-accent/20 rounded-lg transition-colors cursor-pointer flex-shrink-0"
          title="Sign out"
        >
          <LogOut
            className="w-5 h-5 text-sidebar-foreground/60 hover:text-accent transition-colors"
            strokeWidth={1.5}
          />
        </button>
      </div>
    </header>
  );
}
