import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'

export default function SettingsPage() {
  const navigate = useNavigate()
  const [dataRoot, setDataRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [success, setSuccess] = useState<string | null>(null)
  const [configAutoLoaded, setConfigAutoLoaded] = useState(false)
  
  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  
  // SMTP configuration state
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: ''
  })
  const [smtpLoading, setSmtpLoading] = useState(false)

  // OpenAI key state
  const [openAiKey, setOpenAiKey] = useState('')
  const [openAiLoading, setOpenAiLoading] = useState(false)

  // AI backend state
  const [aiBackend, setAiBackend] = useState<'local' | 'openai' | 'ollama'>('local')
  const [aiBackendLoading, setAiBackendLoading] = useState(false)

  useEffect(() => {
    loadCurrentSettings()
  }, [])

  const loadCurrentSettings = async () => {
    try {
      if (!window.api) return
      
      // Load data root
      const dataRootResult = await window.api.getDataRoot()
      if (dataRootResult.error) {
        setErrors([dataRootResult.error.message])
      } else {
        setDataRoot(dataRootResult.path)
      }
      
      // Load SMTP configuration
      const smtpResult = await window.api.getSmtpConfig()
      if (!smtpResult.error && smtpResult.config) {
        setSmtpConfig(smtpResult.config)
      }

      // Load OpenAI key (requires unlock)
      console.log('🔑 Loading OpenAI key in settings...')
      const keyResult = await window.api.getOpenAIKey()
      console.log('🔑 Key result:', keyResult)
      if (!keyResult.error) {
        setOpenAiKey(keyResult.key || '')
        console.log('🔑 Key loaded, length:', keyResult.key?.length || 0)
      } else {
        console.log('🔑 Error loading key:', keyResult.error)
      }

      // Load AI backend configuration
      const aiStatusResult = await window.api.getAIStatus()
      if (!aiStatusResult.error) {
        const backend = aiStatusResult.backend === 'local' ? 'ollama' : aiStatusResult.backend
        setAiBackend(backend as any)
      }
    } catch (error) {
      setErrors(['Failed to load settings'])
    } finally {
      setLoading(false)
    }
  }

  const handleSelectNewFolder = async () => {
    try {
      if (!window.api) return
      
      setErrors([])
      setConfigAutoLoaded(false)
      const result = await window.api.pickDataRootWithConfigCheck()
      
      if (result.error) {
        setErrors([result.error.message])
        return
      }
      
      if (result.canceled || !result.path) {
        return
      }

      const newDataRoot = result.path
      
      if (newDataRoot === dataRoot) {
        setSuccess('No changes needed - same folder selected')
        return
      }

      setUpdating(true)
      
      // Check if config was auto-loaded from the selected folder
      if (result.hasExistingConfig && result.autoLoaded) {
        setConfigAutoLoaded(true)
        setDataRoot(newDataRoot)
        setSuccess(`Existing configuration automatically loaded from: ${newDataRoot}`)
        setUpdating(false)
        return
      }
      
      // Reconfigure with data migration for new folders
      const configResult = await window.api.reconfigureDataRoot(newDataRoot)
      
      if (configResult.error) {
        setErrors([configResult.error.message])
        setUpdating(false)
        return
      }
      
      setDataRoot(newDataRoot)
      setSuccess(`Data folder updated successfully! Your data has been moved to: ${newDataRoot}`)
    } catch (error) {
      setErrors(['Failed to update data folder'])
    } finally {
      setUpdating(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    setPasswordLoading(true)

    try {
      if (!window.api) return

      // Validate
      const validationErrors: string[] = []
      if (!currentPassword.trim()) validationErrors.push('Current password is required')
      if (newPassword && newPassword !== confirmPassword) {
        validationErrors.push('New passwords do not match')
      }
      if (newPassword && newPassword.length < 4) {
        validationErrors.push('Password must be at least 4 characters')
      }

      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        setPasswordLoading(false)
        return
      }

      const result = await window.api.changePassword(currentPassword, newPassword || null)
      
      if (result.error) {
        setErrors([result.error.message])
        setPasswordLoading(false)
        return
      }

      // Success
      setSuccess(newPassword ? 'Password changed successfully!' : 'Password removed successfully!')
      setShowPasswordForm(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setErrors(['Failed to change password'])
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleSaveSmtpConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSmtpLoading(true)
    setErrors([])
    
    try {
      if (!window.api) return
      
      const result = await window.api.saveSmtpConfig(smtpConfig)
      
      if (result.error) {
        setErrors([result.error.message])
      } else {
        setSuccess('SMTP configuration saved successfully')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (error) {
      setErrors(['Failed to save SMTP configuration'])
    } finally {
      setSmtpLoading(false)
    }
  }

  const handleSmtpConfigChange = (field: string, value: string | number | boolean) => {
    setSmtpConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSaveOpenAIKey = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('🔑 Saving OpenAI key in UI...')
    setOpenAiLoading(true)
    setErrors([])
    try {
      if (!window.api) return
      console.log('🔑 Calling saveOpenAIKey API with key length:', openAiKey.trim().length)
      const res = await window.api.saveOpenAIKey(openAiKey.trim())
      console.log('🔑 Save result:', res)
      if (res.error) {
        console.log('🔑 Save error:', res.error)
        setErrors([res.error.message])
      } else {
        console.log('🔑 Save successful')
        setSuccess('OpenAI key saved securely')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (error) {
      console.error('🔑 Save exception:', error)
      setErrors(['Failed to save OpenAI key'])
    } finally {
      setOpenAiLoading(false)
    }
  }

  const handleChangeAIBackend = async (newBackend: 'local' | 'openai' | 'ollama') => {
    setAiBackendLoading(true)
    setErrors([])
    try {
      if (!window.api) return
      const prev = aiBackend
      // Optimistic UI update
      setAiBackend(newBackend)
      const res = await window.api.setAIBackend(newBackend)
      if (res.error) {
        // Revert on error
        setAiBackend(prev)
        setErrors([res.error.message])
      } else {
        setSuccess(`AI backend changed to ${newBackend === 'openai' ? 'OpenAI' : newBackend === 'ollama' ? 'Ollama' : 'Local AI'}`)
        // Reconcile with persisted value
        const status = await window.api.getAIStatus()
        if (!status.error && status.backend) {
          setAiBackend(status.backend as any)
        }
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (error) {
      // Revert on exception
      setAiBackend(prev => prev)
      setErrors(['Failed to change AI backend'])
    } finally {
      setAiBackendLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <PageHeader 
        title="Settings" 
        subtitle="Manage your app configuration and security"
      />

      {/* Success Message */}
      {success && (
        <div className="apple-card bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 p-4 mb-6 animate-fade-in">
          <div className="text-emerald-800 dark:text-emerald-300 text-sm font-medium">
            ✅ {success}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="apple-card bg-destructive/10 border-destructive/20 p-4 mb-6">
          {errors.map((error, idx) => (
            <div key={idx} className="text-destructive text-sm font-medium">
              ❌ {error}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 w-full max-w-6xl">
        {/* Data Folder Configuration */}
        <div className="apple-card bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">
            Data Folder
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            This is where all your bills and expenses are stored. Changing this folder will move all your data to the new location.
          </p>
          
          {dataRoot ? (
            <div className="mb-4">
              <div className="bg-muted p-3 rounded-lg mb-3">
                <div className="font-medium text-card-foreground text-sm mb-1">Current Data Folder:</div>
                <div className="text-muted-foreground text-sm font-mono">{dataRoot}</div>
                {configAutoLoaded && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-2 mt-2">
                    <div className="text-xs text-green-700 font-medium">
                      ✅ Configuration automatically loaded from existing folder
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                • Bills: {dataRoot}/bills<br/>
                • Expenses: {dataRoot}/expenses
              </div>
            </div>
          ) : (
            <div className="mb-4 p-3  rounded-lg">
              <div className="text-muted-foreground text-sm">No data folder configured</div>
            </div>
          )}

          <button
            onClick={handleSelectNewFolder}
            disabled={updating}
            className={`btn btn-lg ${updating ? '' : ''}`}
          >
            {updating ? 'Updating & Migrating...' : 'Change Data Folder'}
          </button>
        </div>

        {/* My Data quick access */}
        <div className="apple-card bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">My Data</h2>
          <p className="text-muted-foreground text-sm mb-4">Maintain your business profile used on generated invoices.</p>
          <button 
            onClick={() => navigate('/settings/my-data')}
            className="btn btn-primary btn-lg"
          >
            Edit My Data
          </button>
        </div>

        {/* Password Configuration */}
        <div className="apple-card bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">
            Password Protection
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            Protect your data with a password. This will require authentication each time you start the app.
          </p>

          {!showPasswordForm ? (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="btn btn-lg"
            >
              Change Password
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Current Password *
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  New Password (leave empty to remove)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password or leave empty"
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              
              {newPassword && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-card-foreground">
                    Confirm New Password *
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    required
                  />
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                    setErrors([])
                  }}
                  className="btn btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="btn btn-lg"
                >
                  {passwordLoading ? 'Updating...' : (newPassword ? 'Change Password' : 'Remove Password')}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* AI Backend Selection */}
        <div className="apple-card bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">
            AI Backend
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose which AI system to use for document analysis and field extraction.
          </p>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 border rounded-lg cursor-pointer transition-all ${
                aiBackend === 'openai' 
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20' 
                  : 'border-input hover:border-primary/50'
              }`}
              onClick={() => !aiBackendLoading && handleChangeAIBackend('openai')}>
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      aiBackend === 'openai' ? 'bg-primary border-primary' : 'border-input'
                    }`}>
                      {aiBackend === 'openai' && <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-card-foreground">OpenAI</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Higher accuracy • Requires API key • Cloud-based
                    </p>
                  </div>
                </div>
              </div>
              <div className={`p-4 border rounded-lg cursor-pointer transition-all ${
                aiBackend === 'ollama' 
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20' 
                  : 'border-input hover:border-primary/50'
              }`}
              onClick={() => !aiBackendLoading && handleChangeAIBackend('ollama')}>
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      aiBackend === 'ollama' ? 'bg-primary border-primary' : 'border-input'
                    }`}>
                      {aiBackend === 'ollama' && <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-card-foreground">Ollama (Gemma3 4B)</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Local service • Downloads model on first run • Requires Ollama installed
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {aiBackendLoading && (
              <div className="text-sm text-muted-foreground text-center">
                Updating AI backend...
              </div>
            )}
          
          </div>
        </div>

        {/* OpenAI API Key */}
        {aiBackend === 'openai' && (
          <div className="apple-card bg-card p-6">
            <h2 className="text-xl font-semibold mb-4 text-card-foreground">
              OpenAI API Key
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Required for OpenAI-powered document analysis. The key is encrypted with your app password and stored locally.
            </p>
          <form onSubmit={handleSaveOpenAIKey} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-1">
                API Key
              </label>
              <input
                type="password"
                value={openAiKey}
                onChange={(e) => setOpenAiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={openAiLoading || !openAiKey.trim()}
                className="btn btn-primary"
              >
                {openAiLoading ? 'Saving...' : 'Save OpenAI Key'}
              </button>
            </div>
          </form>
        </div>
        )}

        {/* SMTP Email Configuration */}
        <div className="apple-card bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">
            Email Configuration (SMTP)
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Configure SMTP settings to send invoices via email to your clients.
          </p>
          
          <form onSubmit={handleSaveSmtpConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">
                  SMTP Host *
                </label>
                <input
                  type="text"
                  value={smtpConfig.host}
                  onChange={(e) => handleSmtpConfigChange('host', e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">
                  Port *
                </label>
                <input
                  type="number"
                  value={smtpConfig.port}
                  onChange={(e) => handleSmtpConfigChange('port', parseInt(e.target.value) || 587)}
                  placeholder="587"
                  min="1"
                  max="65535"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={smtpConfig.user}
                  onChange={(e) => handleSmtpConfigChange('user', e.target.value)}
                  placeholder="your-email@gmail.com"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-1">
                  Password / App Password *
                </label>
                <input
                  type="password"
                  value={smtpConfig.password}
                  onChange={(e) => handleSmtpConfigChange('password', e.target.value)}
                  placeholder="Your email password"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="secure"
                checked={smtpConfig.secure}
                onChange={(e) => handleSmtpConfigChange('secure', e.target.checked)}
                className="rounded border-input text-primary focus:ring-ring"
              />
              <label htmlFor="secure" className="ml-2 text-sm text-card-foreground">
                Use secure connection (SSL/TLS)
              </label>
            </div>
            
            <div className="bg-muted/50 p-3 rounded-md">
              <p className="text-xs text-muted-foreground">
                💡 <strong>Gmail users:</strong> Use port 587 with SSL/TLS disabled, or port 465 with SSL/TLS enabled. 
                You'll need to generate an App Password in your Google Account security settings.
              </p>
            </div>
            
            <button
              type="submit"
              disabled={smtpLoading || !smtpConfig.host || !smtpConfig.user || !smtpConfig.password}
              className="btn btn-primary"
            >
              {smtpLoading ? 'Saving...' : 'Save SMTP Configuration'}
            </button>
          </form>
        </div>

        {/* App Info */}
        <div className="apple-card bg-card p-6">
          <h2 className="text-xl font-semibold mb-4 text-card-foreground">
            About
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version:</span>
              <span className="text-card-foreground font-mono">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database:</span>
              <span className="text-card-foreground font-mono">PGlite</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Storage:</span>
              <span className="text-card-foreground">Local filesystem</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
