import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [dataRoot, setDataRoot] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [configLoaded, setConfigLoaded] = useState(false)

  const handlePickDataRoot = async () => {
    try {
      if (!window.api) return
      const result = await window.api.pickDataRootWithConfigCheck()
      if (result.error) {
        setErrors([result.error.message])
        return
      }
      if (!result.canceled && result.path) {
        setDataRoot(result.path)
        
        // Check if config was auto-loaded
        if (result.hasExistingConfig && result.autoLoaded) {
          setConfigLoaded(true)
          setErrors([]) // Clear any existing errors
          // Skip to password setup or complete onboarding since data root is already configured
          const statusResult = await window.api.getStatus()
          if (statusResult.hasPassword) {
            // Already configured completely, redirect to login
            navigate('/lock')
            return
          } else {
            // Move to password setup step
            setStep(1)
            return
          }
        }
        
        // Ensure directory exists for new folders
        await window.api.ensureDir(result.path)
      }
    } catch (error) {
      setErrors(['Failed to select data folder'])
    }
  }

  const handleComplete = async () => {
    setErrors([])
    setLoading(true)

    try {
      if (!window.api) return

      // Validate
      const validationErrors: string[] = []
      if (!dataRoot) validationErrors.push('Data folder is required')
      if (password && password !== confirmPassword) {
        validationErrors.push('Passwords do not match')
      }
      if (password && password.length < 4) {
        validationErrors.push('Password must be at least 4 characters')
      }

      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        setLoading(false)
        return
      }

      // Save settings with single data root
      const settingsResult = await window.api.saveSettings({
        dataRoot: dataRoot!
      })

      if (settingsResult.error) {
        setErrors([settingsResult.error.message])
        setLoading(false)
        return
      }

      // Set password if provided
      if (password) {
        const passwordResult = await window.api.setPassword(password)
        if (passwordResult.error) {
          setErrors([passwordResult.error.message])
          setLoading(false)
          return
        }
      }

      // Redirect to dashboard
      navigate('/dashboard')
    } catch (error) {
      setErrors(['Failed to complete onboarding'])
      setLoading(false)
    }
  }

  const canProceedToStep1 = dataRoot

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="apple-card bg-card p-10 w-full max-w-xl">
        <h1 className="text-3xl font-bold mb-2 text-card-foreground">
          Welcome to Bills App
        </h1>
        
        <p className="text-muted-foreground mb-8">
          Let's set up your local billing system
        </p>

        {errors.length > 0 && (
          <div className="bg-destructive/10 border-destructive/20 rounded-xl p-3 mb-6">
            {errors.map((error, idx) => (
              <div key={idx} className="text-destructive text-sm">
                {error}
              </div>
            ))}
          </div>
        )}

        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-6 text-card-foreground">
              Step 1: Choose Your Data Folder
            </h2>

            <p className="text-muted-foreground text-sm mb-6">
              Select a folder where Bills App will store all your data. We'll automatically create 'bills' and 'expenses' subfolders inside.
            </p>

            <div className="mb-8">
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Data Folder
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePickDataRoot}
                  className="btn btn-lg"
                >
                  Select Folder
                </button>
                {dataRoot && (
                  <div className="flex-1">
                    <span className="text-sm text-muted-foreground block">
                      {dataRoot}
                    </span>
                    {configLoaded && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-2 mt-2">
                        <div className="text-xs text-green-700 font-medium">
                          ✅ Existing configuration automatically loaded
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      • Bills: {dataRoot}/bills<br/>
                      • Expenses: {dataRoot}/expenses
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                disabled={!canProceedToStep1}
                className={`btn btn-lg ${canProceedToStep1 ? '' : ''}`}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-6 text-card-foreground">
              Step 2: Security (Optional)
            </h2>

            <p className="text-muted-foreground mb-6 text-sm">
              Protect your data with a password. You can skip this step.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (optional)"
                className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(0)}
                className="btn btn-lg"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={loading}
                className="btn btn-lg"
              >
                {loading ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
