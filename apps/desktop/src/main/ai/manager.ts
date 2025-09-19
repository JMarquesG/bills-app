// AI Manager - Coordinates between different AI providers

import { client } from '@bills/db'
import { AIProvider, AIBackend, DocumentType, AIAnalysisResult, AIConfig } from './types'
import { OpenAIProvider, OllamaAIProvider } from './providers'

export class AIManager {
  private providers: Map<AIBackend, AIProvider> = new Map()
  private currentBackend: AIBackend = 'ollama' 

  constructor() {
    // Initialize providers
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('ollama', new OllamaAIProvider())
  }

  async initialize(): Promise<void> {
    console.log('🤖 Initializing AI Manager...')
    
    // Load current backend from database
    this.currentBackend = await this.getAIBackend()
    
    // Initialize the current backend
    const provider = this.providers.get(this.currentBackend)
    if (provider) {
      // For OpenAI, we need to set the API key first
      if (this.currentBackend === 'openai') {
        const apiKey = await this.getOpenAIKey()
        if (apiKey && provider instanceof OpenAIProvider) {
          provider.setApiKey(apiKey)
        }
      }
      
      await provider.initialize()
    }

    console.log(`✅ AI Manager initialized with backend: ${this.currentBackend}`)
  }

  async analyzeDocument(filePath: string, documentType: DocumentType): Promise<AIAnalysisResult> {
    const provider = await this.getCurrentProvider()
    
    if (!provider.isReady()) {
      await provider.initialize()
    }

    return await provider.analyzeDocument(filePath, documentType)
  }

  async extractText(filePath: string): Promise<string> {
    const provider = await this.getCurrentProvider()
    
    if (!provider.isReady()) {
      await provider.initialize()
    }

    return await provider.extractText(filePath)
  }

  async setBackend(backend: AIBackend): Promise<void> {
    if (!this.providers.has(backend)) {
      throw new Error(`Unknown AI backend: ${backend}`)
    }

    // Upsert setting row to ensure persistence even if row doesn't exist yet
    await client.query(
      'INSERT INTO setting (id, ai_backend) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET ai_backend = EXCLUDED.ai_backend',
      [backend]
    )

    this.currentBackend = backend
    console.log(`🔄 AI backend switched to: ${backend}`)
  }

  async getConfig(): Promise<AIConfig> {
    return {
      backend: await this.getAIBackend(),
      openaiKey: (await this.getOpenAIKey()) !== null ? '***' : undefined
    }
  }

  async getStatus() {
    const backend = await this.getAIBackend()
    const provider = this.providers.get(backend)
    const localProvider = this.providers.get('ollama')
    
    // Get local AI status and convert to simple string format expected by frontend
    const localProviderStatus = localProvider?.getStatus() || { status: 'stopped', initialized: false, loading: false }
    let localStatus: 'stopped' | 'starting' | 'running' | 'error' = 'stopped'
    
    if (localProviderStatus.loading) {
      localStatus = 'starting'
    } else if (localProviderStatus.status === 'running') {
      localStatus = 'running'
    } else if (localProviderStatus.status === 'error') {
      localStatus = 'error'
    } else {
      localStatus = 'stopped'
    }
    
    return {
      backend,
      localStatus,
      openAiConfigured: (await this.getOpenAIKey()) !== null,
      currentProvider: provider?.getStatus() || { status: 'stopped', initialized: false, loading: false }
    }
  }

  async startLocal(): Promise<void> {
    const localProvider = this.providers.get('ollama')
    if (!localProvider) return
    // Always initialize first
    await localProvider.initialize()
    // Then warmup to ensure model is actually loaded
    if (typeof localProvider.warmup === 'function') {
      await localProvider.warmup()
    }
  }

  async stopLocal(): Promise<void> {
    const localProvider = this.providers.get('ollama')
    if (localProvider && localProvider.cleanup) {
      await localProvider.cleanup()
    }
  }

  async startOllama(): Promise<void> {
    console.log('🟢 Manager: startOllama called')
    const provider = this.providers.get('ollama')
    if (!provider) {
      console.error('🔴 Manager: ollama provider missing')
      return
    }
    await provider.initialize()
    if (typeof provider.warmup === 'function') {
      await provider.warmup()
    }
    console.log('🟢 Manager: startOllama done')
  }

  async stopOllama(): Promise<void> {
    console.log('🟡 Manager: stopOllama called')
    const provider = this.providers.get('ollama')
    if (provider && provider.cleanup) {
      await provider.cleanup()
    }
    console.log('🟡 Manager: stopOllama done')
  }



  private async getCurrentProvider(): Promise<AIProvider> {
    const backend = await this.getAIBackend()
    const provider = this.providers.get(backend)
    
    if (!provider) {
      throw new Error(`No provider found for backend: ${backend}`)
    }

    // For OpenAI, ensure API key is set
    if (backend === 'openai') {
      const apiKey = await this.getOpenAIKey()
      if (!apiKey) {
        throw new Error('OpenAI API key not configured')
      }
      if (provider instanceof OpenAIProvider) {
        provider.setApiKey(apiKey)
      }
    }

    return provider
  }

  private async getAIBackend(): Promise<AIBackend> {
    try {
      const result = await client.query('SELECT ai_backend FROM setting WHERE id = 1')
      const row = result.rows[0] as any
      const backend = row?.ai_backend as string
      return backend === 'openai' ? 'openai' : backend === 'ollama' ? 'ollama' : 'ollama' // Default to local
    } catch {
      return 'ollama' // Default fallback
    }
  }

  private async getOpenAIKey(): Promise<string | null> {
    try {
      const keyRes = await client.query('SELECT openai_key FROM setting WHERE id = 1')
      const row = keyRes.rows?.[0] as any
      const keyText = row?.openai_key as string | undefined
      if (!keyText) return null

      const parsedKey = JSON.parse(keyText)

      if (parsedKey.encrypted === false) {
        return parsedKey.plainText || parsedKey.key
      } else if (parsedKey.encrypted === true) {
        try {
          const { decryptSecret, hasSessionKey } = await import('../secrets')
          if (!hasSessionKey()) return null
          return decryptSecret(parsedKey.iv, parsedKey.cipherText)
        } catch {
          return null
        }
      }

      return null
    } catch {
      return null
    }
  }

  async cleanup(): Promise<void> {
    console.log('🤖 AI Manager cleanup...')
    
    for (const [name, provider] of this.providers) {
      if (provider.cleanup) {
        await provider.cleanup()
      }
    }
    
    console.log('✅ AI Manager cleanup complete')
  }
}
