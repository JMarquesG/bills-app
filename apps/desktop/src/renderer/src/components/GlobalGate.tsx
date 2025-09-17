import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSessionStore } from '../store/session'

export function GlobalGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { unlocked } = useSessionStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkStatus = async () => {
      if (!isMounted) return
      
      // Check if window.api is available (Electron environment)
      if (typeof window !== 'undefined' && window.api) {
        try {
          const result = await window.api.getStatus()
          
          if (!isMounted) return
          
          if (result.error) {
            navigate('/onboarding')
            return
          }

          // Redirect logic based on status
          if (!result.hasSettings) {
            navigate('/onboarding')
          } else if (result.hasPassword && !unlocked) {
            navigate('/lock')
          } else {
            // App is ready, redirect to dashboard if on initial pages
            if (['/onboarding', '/lock', '/'].includes(location.pathname)) {
              navigate('/dashboard')
            }
          }
        } catch (error) {
          // On error, default to onboarding
          if (isMounted) {
            navigate('/onboarding')
          }
        }
      } else {
        // Web mode or API not available, go to onboarding
        if (isMounted) {
          navigate('/onboarding')
        }
      }
      
      if (isMounted) {
        setLoading(false)
      }
    }

    // Timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (isMounted && loading) {
        setLoading(false)
        navigate('/onboarding')
      }
    }, 3000)

    checkStatus()

    return () => {
      isMounted = false
      clearTimeout(timeout)
    }
  }, [navigate, location.pathname, unlocked])

  // Show loading while checking status
  if (loading) {
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
