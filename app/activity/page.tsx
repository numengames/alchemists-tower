"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Calendar, User, Globe, Clock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ActivityPage() {
  const [mounted, setMounted] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    const loggedIn = localStorage.getItem("isLoggedIn") === "true"
    if (!loggedIn) {
      router.replace("/login")
    } else {
      setIsLoggedIn(true)
    }
  }, [router])

  if (!mounted || !isLoggedIn) {
    return null
  }

  const activities = [
    {
      id: 1,
      type: "world_created",
      user: "Sera Nyx",
      action: "created world",
      target: "Alpha Genesis",
      timestamp: "2 hours ago",
    },
    {
      id: 2,
      type: "world_updated",
      user: "Kai Storm",
      action: "updated world",
      target: "Echo Chamber",
      timestamp: "5 hours ago",
    },
    {
      id: 3,
      type: "world_paused",
      user: "Luna Code",
      action: "paused world",
      target: "Void Realm",
      timestamp: "1 day ago",
    },
  ]

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Activity Log</h1>
          <p className="text-foreground/60">Recent actions and events across all worlds</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Track all changes and actions in your ecosystem</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border hover:bg-sidebar-accent/30 transition-colors"
                >
                  <div className="p-2 rounded-full bg-primary/10">
                    <Globe className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3 h-3 text-foreground/60" />
                      <span className="font-medium text-foreground">{activity.user}</span>
                      <span className="text-foreground/60">{activity.action}</span>
                      <span className="font-medium text-primary">{activity.target}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-foreground/50">
                      <Calendar className="w-3 h-3" />
                      {activity.timestamp}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}