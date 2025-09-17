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
