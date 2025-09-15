'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard - GlobalGate will handle onboarding/lock logic
    router.replace('/dashboard')
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center">
        <div className="text-lg mb-2 text-foreground font-semibold">
          Bills App
        </div>
        <div className="text-sm text-muted-foreground">
          Loading...
        </div>
      </div>
    </div>
  )
}
