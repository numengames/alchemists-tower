"use client"

import { MoreVertical, Zap, Clock, User, GitBranch, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { STATUS_CONFIG, ENV_CONFIG } from "@/lib/constants"
import type { World } from "@/lib/types"

type WorldCardProps = World

export function WorldCard({ 
  id, 
  name, 
  environment, 
  version, 
  status, 
  owner, 
  createdDate, 
  description,
  url 
}: WorldCardProps) {
  const statusInfo = STATUS_CONFIG[status]
  const envInfo = ENV_CONFIG[environment]

  return (
    <div
      className={cn(
        "group relative bg-sidebar/50 border-2 border-sidebar-border rounded-xl p-6 hover:border-accent/50 transition-all duration-300",
        status === "active" && "shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 border-emerald-500/30",
      )}
    >
      {/* Decorative gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent rounded-t-xl"></div>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <span 
              className="text-xs font-mono px-2 py-1 rounded-full bg-sidebar-accent/50 text-foreground/70"
              title={envInfo.label}
            >
              {envInfo.shortLabel}
            </span>
          </div>
          <p className="text-sm text-foreground/60">{description}</p>
        </div>
        <button 
          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-sidebar-accent/30 rounded-lg"
          aria-label="More options"
        >
          <MoreVertical className="w-4 h-4 text-foreground/60" strokeWidth={1.5} />
        </button>
      </div>

      {/* Status Badge */}
      <div className="mb-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
            statusInfo.color,
          )}
        >
          {status === "active" && <Zap className="w-3 h-3" strokeWidth={2} />}
          {statusInfo.label}
        </span>
      </div>

      {/* Meta Info */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div className="flex items-center gap-2 text-foreground/70">
          <User className="w-4 h-4 text-solar-gold/60" strokeWidth={1.5} />
          <span>{owner}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground/70">
          <GitBranch className="w-4 h-4 text-solar-gold/60" strokeWidth={1.5} />
          <span className="font-mono text-xs">{version}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground/70">
          <Clock className="w-4 h-4 text-solar-gold/60" strokeWidth={1.5} />
          <span>{new Date(createdDate).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-sidebar-border text-foreground hover:border-accent/50 hover:bg-accent/10 bg-transparent"
        >
          Update
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-sidebar-border text-foreground hover:border-accent/50 hover:bg-accent/10 bg-transparent"
        >
          {status === "active" ? "Pause" : "Resume"}
        </Button>
        <Button variant="ghost" size="sm" className="text-accent hover:bg-accent/10">
          <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  )
}