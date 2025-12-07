"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { TopBar } from "@/components/top-bar"
import { DashboardContent } from "@/components/dashboard-content"
import { CreateWorldModal } from "@/components/create-world-modal"
import { LogoutModal } from "@/components/logout-modal"
import { AuthProvider } from "@/components/auth-provider"

export function Dashboard() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    setIsMounted(true)
    
    // Check authentication
    const checkAuth = () => {
      try {
        const loggedIn = localStorage.getItem("isLoggedIn") === "true"
        const token = localStorage.getItem("auth_token")
        
        if (!loggedIn || !token) {
          router.replace("/login")
          return
        }
        
        setIsLoggedIn(true)
      } catch (error) {
        console.error("Auth check error:", error)
        router.replace("/login")
      } finally {
        setIsChecking(false)
      }
    }

    checkAuth()
  }, [router])

  const handleLogoutConfirm = () => {
    try {
      setIsLogoutModalOpen(false)
      localStorage.removeItem("isLoggedIn")
      localStorage.removeItem("auth_token")
      router.replace("/login")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  // Show loading state while checking auth or not mounted
  if (!isMounted || isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-foreground/60">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render dashboard if not logged in
  if (!isLoggedIn) {
    return null
  }

  return (
    <AuthProvider isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar onCreateClick={() => setIsCreateModalOpen(true)} onSignOut={() => setIsLogoutModalOpen(true)} />
          <DashboardContent onCreateClick={() => setIsCreateModalOpen(true)} />
          <CreateWorldModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
          <LogoutModal
            isOpen={isLogoutModalOpen}
            onConfirm={handleLogoutConfirm}
            onCancel={() => setIsLogoutModalOpen(false)}
          />
        </div>
      </div>
    </AuthProvider>
  )
}