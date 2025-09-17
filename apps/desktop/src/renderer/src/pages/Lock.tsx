import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../store/session'

export default function LockPage() {
  const navigate = useNavigate()
  const { setUnlocked } = useSessionStore()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!window.api) return
      
      const result = await window.api.verifyPassword(password)
      
      if (result.error) {
        setError(result.error.message)
        setLoading(false)
        return
      }

      if (result.valid) {
        setUnlocked(true)
        navigate('/dashboard')
      } else {
        setError('Incorrect password')
      }
    } catch (error) {
      setError('Failed to verify password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="apple-card bg-card p-10 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            🔒
          </div>
          
          <h1 className="text-2xl font-bold mb-2 text-card-foreground">
            Enter Password
          </h1>
          
          <p className="text-muted-foreground text-sm">
            Your data is protected. Please enter your password to continue.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border-destructive/20 rounded-xl p-3 mb-6 text-destructive text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoFocus
              required
              className="w-full p-4 border-2 rounded-xl text-base text-center bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="btn btn-lg w-full"
          >
            {loading ? 'Verifying...' : 'Unlock'}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-xs text-muted-foreground">
            Bills App • Local Data Protection
          </p>
        </div>
      </div>
    </div>
  )
}
