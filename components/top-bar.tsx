"use client"

import { Plus, Bell, Settings, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePathname } from "next/navigation"

interface TopBarProps {
  onCreateClick?: () => void
  onSignOut: () => void
}

export function TopBar({ onCreateClick, onSignOut }: TopBarProps) {
  const pathname = usePathname()
  const isOnDashboard = pathname === "/dashboard"

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground">Khepri Forge</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Solo mostrar botón Create en dashboard */}
        {isOnDashboard && onCreateClick && (
          <Button 
            onClick={onCreateClick} 
            className="bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
          >
            <Plus className="w-4 h-4 mr-2" strokeWidth={2} />
            Create World
          </Button>
        )}

        <button 
          className="p-2 hover:bg-sidebar-accent/30 rounded-lg transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-foreground/60" strokeWidth={1.5} />
        </button>

        <button 
          className="p-2 hover:bg-sidebar-accent/30 rounded-lg transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5 text-foreground/60" strokeWidth={1.5} />
        </button>

        <button 
          onClick={onSignOut}
          className="p-2 hover:bg-sidebar-accent/30 rounded-lg transition-colors text-foreground/60 hover:text-destructive"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  )
}