import { useEffect, useState } from 'react'

interface AIStatus {
  backend: 'local' | 'openai' | 'ollama'
  localStatus: 'stopped' | 'starting' | 'running' | 'error'
  openAiConfigured: boolean
  currentProvider?: {
    status: 'stopped' | 'starting' | 'running' | 'error'
    initialized: boolean
    loading: boolean
    error?: string
    download?: {
      inProgress: boolean
      percent?: number
      completedBytes?: number
      totalBytes?: number
      message?: string
    }
  }
}

export function AIStatusIndicator() {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadAIStatus()
    const phase = aiStatus?.backend === 'local' ? aiStatus?.localStatus : aiStatus?.currentProvider?.status
    const pollInterval = phase === 'starting' ? 2000 : 5000
    const interval = setInterval(loadAIStatus, pollInterval)
    return () => clearInterval(interval)
  }, [aiStatus?.backend, aiStatus?.localStatus, aiStatus?.currentProvider?.status])

  const loadAIStatus = async () => {
    try {
      if (!window.api) return
      const result = await window.api.getAIStatus()
      if (!result.error) {
        setAiStatus({
          backend: result.backend,
          localStatus: result.localStatus as any,
          openAiConfigured: result.openAiConfigured,
          currentProvider: result.currentProvider as any
        })
      }
    } catch (error) {
      console.error('Failed to load AI status:', error)
    }
  }

  const handleStartLocalAI = async () => {
    if (!window.api) return
    setIsLoading(true)
    try {
      const result = await window.api.startLocalAI()
      if (!result.error) {
        await loadAIStatus()
      }
    } catch (error) {
      console.error('Failed to start local AI:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopLocalAI = async () => {
    if (!window.api) return
    setIsLoading(true)
    try {
      const result = await window.api.stopLocalAI()
      if (!result.error) {
        await loadAIStatus()
      }
    } catch (error) {
      console.error('Failed to stop local AI:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartOllama = async () => {
    if (!window.api) return
    setIsLoading(true)
    try {
      const result = await window.api.startOllamaAI()
      if (!result.error) {
        await loadAIStatus()
      }
    } catch (error) {
      console.error('Failed to start Ollama:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopOllama = async () => {
    if (!window.api) return
    setIsLoading(true)
    try {
      const result = await window.api.stopOllamaAI()
      if (!result.error) {
        await loadAIStatus()
      }
    } catch (error) {
      console.error('Failed to stop Ollama:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!aiStatus) {
    return (
      <div className="relative">
        <div className="p-2 rounded-lg text-muted-foreground">
          <div className="h-5 w-5 animate-pulse bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  const getStatusIcon = () => {
    if (aiStatus.backend === 'openai') {
      return aiStatus.openAiConfigured ? '🤖' : '❌'
    }
    const phase = aiStatus.backend === 'local' ? aiStatus.localStatus : aiStatus.currentProvider?.status
    switch (phase) {
      case 'running': return '🟢'
      case 'starting': return (
        <div className="flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></div>
        </div>
      )
      case 'error': return '🔴'
      case 'stopped': return '⚪'
      default: return '⚪'
    }
  }

  const getStatusText = () => {
    if (aiStatus.backend === 'openai') {
      return aiStatus.openAiConfigured ? 'OpenAI Ready' : 'OpenAI Not Configured'
    }
    const phase = aiStatus.backend === 'local' ? aiStatus.localStatus : aiStatus.currentProvider?.status
    switch (phase) {
      case 'running': return 'Local AI Ready'
      case 'starting': return 'Loading AI Model...'
      case 'error': return aiStatus.backend === 'ollama' ? 'Ollama Error' : 'Local AI Error'
      case 'stopped': return aiStatus.backend === 'ollama' ? 'Ollama Stopped' : 'Local AI Stopped'
      default: return aiStatus.backend === 'ollama' ? 'Ollama Unknown' : 'Local AI Unknown'
    }
  }

  const getDetailedStatusText = () => {
    if (aiStatus.backend === 'openai') {
      return aiStatus.openAiConfigured ? 'Ready for document analysis' : 'Configure API key in Settings'
    }
    const phase = aiStatus.backend === 'local' ? aiStatus.localStatus : aiStatus.currentProvider?.status
    switch (phase) {
      case 'running': return 'Ready for document analysis'
      case 'starting': {
        if (aiStatus.backend === 'ollama' && aiStatus.currentProvider?.download?.inProgress) {
          const p = aiStatus.currentProvider.download
          const pct = typeof p.percent === 'number' ? ` ${p.percent}%` : ''
          return `Pulling Gemma3 4B...${pct}${p.message ? ` — ${p.message}` : ''}`
        }
        return aiStatus.backend === 'ollama' ? 'Starting Ollama and pulling models...' : 'Downloading and loading AI models...'
      }
      case 'error': return 'Failed to load AI models'
      case 'stopped': return aiStatus.backend === 'local' ? '' : 'Click Start to begin using AI'
      default: return 'Status unknown'
    }
  }

  const canControlLocal = aiStatus.backend === 'local'
  const canControlOllama = aiStatus.backend === 'ollama'

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="p-2 rounded-lg hover:bg-secondary transition-colors flex items-center gap-2"
        title={getStatusText()}
      >
        <div className="text-sm flex items-center justify-center w-5 h-5">
          {getStatusIcon()}
        </div>
        <svg
          className={`h-3 w-3 text-muted-foreground transform transition-transform ${
            showDropdown ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="p-3">
            <div className="text-sm font-medium text-card-foreground mb-2">
              AI Status
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-4 h-4">
                    {getStatusIcon()}
                  </div>
                  <span className="text-sm text-card-foreground">
                    {aiStatus.backend === 'openai' ? 'OpenAI' : 'Ollama'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {getDetailedStatusText()}
                </div>
              </div>

              { canControlOllama && (
                <div className="border-t border-border pt-2">
                  <div className="text-xs text-muted-foreground mb-2">{canControlOllama ? 'Ollama Control:' : 'Local AI Control:'}</div>
                  <div className="flex gap-2">
                    {(canControlLocal ? aiStatus.localStatus === 'stopped' : aiStatus.currentProvider?.status === 'stopped') && (
                      <button
                        onClick={canControlOllama ? handleStartOllama : handleStartLocalAI}
                        disabled={isLoading}
                        className="flex-1 px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isLoading ? 'Starting...' : 'Start AI'}
                      </button>
                    )}
                    {(canControlLocal ? aiStatus.localStatus === 'running' : aiStatus.currentProvider?.status === 'running') && (
                      <button
                        onClick={canControlOllama ? handleStopOllama : handleStopLocalAI}
                        disabled={isLoading}
                        className="flex-1 px-3 py-1 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50"
                      >
                        {isLoading ? 'Stopping...' : 'Stop AI'}
                      </button>
                    )}
                    {(canControlLocal ? aiStatus.localStatus === 'error' : aiStatus.currentProvider?.status === 'error') && (
                      <button
                        onClick={canControlOllama ? handleStartOllama : handleStartLocalAI}
                        disabled={isLoading}
                        className="flex-1 px-3 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 disabled:opacity-50"
                      >
                        {isLoading ? 'Restarting...' : 'Restart AI'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  )
}
