'use client';

import { Home, Settings, BarChart3, Bell, HelpCircle, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { icon: Home, label: 'Dashboard', href: '/dashboard' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { icon: Bell, label: 'Activity', href: '/activity' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border p-6 flex flex-col h-screen overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
          <Sun className="w-6 h-6 text-sidebar-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-sm font-serif font-bold text-sidebar-foreground">KHEPRI</h1>
          <p className="text-xs text-sidebar-foreground/60">FORGE</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.label} href={item.href}>
              <button
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors group ${
                  isActive
                    ? 'bg-sidebar-primary/20 text-sidebar-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/20'
                }`}
              >
                <item.icon
                  className={`w-5 h-5 transition-colors ${
                    isActive
                      ? 'text-sidebar-primary'
                      : 'text-sidebar-foreground/60 group-hover:text-accent'
                  }`}
                  strokeWidth={1.5}
                />
                <span>{item.label}</span>
              </button>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <Button
        variant="outline"
        size="sm"
        className="w-full border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/20 bg-transparent cursor-pointer"
      >
        <HelpCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
        Help & Support
      </Button>
    </aside>
  );
}
