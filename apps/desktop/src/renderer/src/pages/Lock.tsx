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
      <div className="apple-card bg-card p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2 text-card-foreground">
            Enter Password
          </h1>
          <p className="text-muted-foreground">
            Please enter your password to continue
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border-destructive/20 rounded-xl p-3 mb-6">
            <div className="text-destructive text-sm">
              {error}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full p-3 rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full btn btn-lg btn-primary"
          >
            {loading ? 'Verifying...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
