"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard if logged in, otherwise to login
    const isLoggedIn = localStorage.getItem("isLoggedIn") === "true"
    const token = localStorage.getItem("auth_token")
    
    if (isLoggedIn && token) {
      router.replace("/dashboard")
    } else {
      router.replace("/login")
    }
  }, [router])

  // Show loading while redirecting
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-foreground/60">Loading...</p>
      </div>
    </div>
  )
}