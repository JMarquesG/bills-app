import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSessionStore } from '../store/session'

export function GlobalGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { unlocked, setUnlocked } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<{ hasSettings: boolean; hasPassword: boolean; dataRoot?: string } | null>(null)
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...')

  useEffect(() => {
    console.log('🔄 GlobalGate: Starting initialization on', location.pathname)
    let isMounted = true

    // Fallback timeout in case IPC is not available or slow
    const fallbackTimeout = setTimeout(() => {
      if (isMounted && loading) {
        console.log('⏱️ FALLBACK: IPC not responding, defaulting to onboarding')
        setDebugInfo('IPC timeout - proceeding to onboarding')
        setLoading(false)
        navigate('/onboarding')
      }
    }, 3000)
    
    const checkStatus = async () => {
      if (!isMounted) return
      
      console.log('🔍 GlobalGate: Checking app status...')
      
      setDebugInfo(`Checking API availability...`)
      const apiExists = typeof window !== 'undefined' && !!window.api
      console.log('🔗 window.api exists:', apiExists, 'window defined:', typeof window !== 'undefined')
      console.log('🔗 window.api type:', typeof window.api)
      console.log('🔗 window.api.getStatus type:', typeof window.api?.getStatus)
      
      if (apiExists) {
        try {
          setDebugInfo(`Calling IPC getStatus...`)
          console.log('📡 Calling window.api.getStatus()...')
          
          const result = await window.api!.getStatus()
          
          console.log('📊 IPC call completed, isMounted:', isMounted)
          if (!isMounted) return
          
          console.log('📊 IPC Result:', result)
          
          if (result.error) {
            console.error('❌ Failed to get status:', result.error)
            setDebugInfo(`IPC Error: ${result.error.message}`)
            console.log('🔴 Setting loading to false (error case)')
            setLoading(false)
            navigate('/onboarding')
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
            console.log('🟡 Setting loading to false (no settings)')
            setLoading(false)
            navigate('/onboarding')
          } else if (result.hasPassword && !unlocked) {
            console.log('🔒 Redirecting to /lock (password required)')
            setDebugInfo('Password required - redirecting to lock')
            console.log('🟡 Setting loading to false (needs password)')
            setLoading(false)
            navigate('/lock')
          } else {
            console.log('✅ App ready - staying on current page or redirecting to dashboard')
            setDebugInfo('App ready!')
            console.log('🟢 Setting loading to false (app ready)')
            setLoading(false)
            if (location.pathname === '/onboarding' || location.pathname === '/lock' || location.pathname === '/') {
              navigate('/dashboard')
            }
          }
        } catch (error) {
          console.error('❌ Failed to check status:', error)
          console.log('🔄 Timeout or error - defaulting to onboarding')
          setDebugInfo(`Timeout/Error: ${error instanceof Error ? error.message : 'Unknown'}`)
          if (isMounted) {
            console.log('🔴 Setting loading to false (catch case)')
            setLoading(false)
            navigate('/onboarding')
          }
        }
      } else {
        console.log('🌐 In web mode or API not available, skipping status check')
        setDebugInfo('Web mode - no IPC available')
        if (isMounted) {
          console.log('🟠 Setting loading to false (no API)')
          setLoading(false)
          navigate('/onboarding')
        }
      }
    }

    console.log('⏰ Setting up safety timeout...')
    // Add a safety timeout at component level
    const safetyTimeout = setTimeout(() => {
      console.log('⚠️ SAFETY TIMEOUT TRIGGERED - isMounted:', isMounted)
      if (isMounted && loading) {
        console.log('⚠️ SAFETY TIMEOUT: Force redirect to onboarding after 2s')
        setDebugInfo('Safety timeout - redirecting...')
        console.log('🚨 SAFETY: Setting loading to false')
        setLoading(false)
        navigate('/onboarding')
      }
    }, 2000)

    console.log('🚀 Starting checkStatus...')
    checkStatus().finally(() => {
      console.log('✅ checkStatus completed, clearing timeout')
      clearTimeout(safetyTimeout)
    })

    return () => {
      console.log('🧹 GlobalGate cleanup - setting isMounted to false')
      isMounted = false
      clearTimeout(fallbackTimeout)
      clearTimeout(safetyTimeout)
    }
  }, [navigate, unlocked])

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
          Path: {location.pathname}
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
