'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { useSessionStore } from '../store/session'

export function GlobalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { unlocked, setUnlocked } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<{ hasSettings: boolean; hasPassword: boolean; dataRoot?: string } | null>(null)
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...')

  useEffect(() => {
    const checkStatus = async () => {
      console.log('🔍 GlobalGate: Starting status check...')
      console.log('📍 Current pathname:', pathname)
      
      setDebugInfo(`Checking API availability...`)
      const apiExists = typeof window !== 'undefined' && !!window.api
      console.log('🔗 window.api exists:', apiExists)
      
      if (apiExists) {
        try {
          setDebugInfo(`Calling IPC getStatus...`)
          console.log('📡 Calling window.api.getStatus()...')
          
          // Add a shorter timeout for faster fallback
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('IPC timeout after 3s')), 3000)
          )
          
          const result = await Promise.race([
            window.api!.getStatus(),
            timeoutPromise
          ]) as any
          
          console.log('📊 IPC Result:', result)
          
          if (result.error) {
            console.error('❌ Failed to get status:', result.error)
            setDebugInfo(`IPC Error: ${result.error.message}`)
            // On error, assume first-time setup needed
            setTimeout(() => router.push('/onboarding'), 100)
            setLoading(false)
            return
          }

          setStatus({ 
            hasSettings: result.hasSettings, 
            hasPassword: result.hasPassword,
            dataRoot: result.dataRoot
          })

          // Redirect logic based on status
          if (!result.hasSettings) {
            console.log('➡️ Redirecting to /onboarding (no settings)')
            setDebugInfo('No settings found - redirecting to onboarding')
            if (pathname !== '/onboarding') {
              setTimeout(() => router.push('/onboarding'), 100)
            }
          } else if (result.hasPassword && !unlocked) {
            console.log('🔒 Redirecting to /lock (password required)')
            setDebugInfo('Password required - redirecting to lock')
            if (pathname !== '/lock') {
              setTimeout(() => router.push('/lock'), 100)
            }
          } else {
            console.log('✅ App ready - staying on current page or redirecting to dashboard')
            setDebugInfo('App ready!')
            if (pathname === '/onboarding' || pathname === '/lock' || pathname === '/') {
              setTimeout(() => router.push('/dashboard'), 100)
            }
          }
          
          setLoading(false)
        } catch (error) {
          console.error('❌ Failed to check status:', error)
          console.log('🔄 Timeout or error - defaulting to onboarding')
          setDebugInfo(`Timeout/Error: ${error instanceof Error ? error.message : 'Unknown'}`)
          // On timeout/error, default to onboarding
          setTimeout(() => router.push('/onboarding'), 100)
          setLoading(false)
        }
      } else {
        console.log('🌐 In web mode or API not available, skipping status check')
        setDebugInfo('Web mode - no IPC available')
        // In web mode, always go to onboarding
        setTimeout(() => router.push('/onboarding'), 100)
        setLoading(false)
      }
    }

    // Add a safety timeout at component level
    const safetyTimeout = setTimeout(() => {
      console.log('⚠️ SAFETY TIMEOUT: Force redirect to onboarding after 8s')
      setDebugInfo('Safety timeout - redirecting...')
      router.push('/onboarding')
      setLoading(false)
    }, 8000)

    checkStatus().finally(() => {
      clearTimeout(safetyTimeout)
    })

    return () => clearTimeout(safetyTimeout)
  }, [router, unlocked, pathname])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '18px',
        gap: '10px'
      }}>
        <div>Bills App</div>
        <div style={{ fontSize: '14px', color: '#666' }}>
          {debugInfo}
        </div>
        <div style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
          Path: {pathname}
        </div>
      </div>
    )
  }

  // If we need to redirect to onboarding or lock, show loading until redirect happens
  if (status && (!status.hasSettings || (status.hasPassword && !unlocked))) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    )
  }

  return <>{children}</>
}
