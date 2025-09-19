// AI System Types and Interfaces

export type DocumentType = 'expense' | 'bill'
export type AIBackend =   'openai' | 'ollama'

export interface AIAnalysisResult {
  fields: Record<string, any>
  text: string
  confidence: number
  backend: AIBackend
  method?: string
}

export interface AIProvider {
  name: AIBackend
  initialize(): Promise<void>
  isReady(): boolean
  getStatus(): AIProviderStatus
  analyzeDocument(filePath: string, documentType: DocumentType): Promise<AIAnalysisResult>
  extractText(filePath: string): Promise<string>
  // Optional warmup to pre-load heavy models so provider is truly ready
  warmup?(): Promise<void>
  cleanup?(): Promise<void>
}

export interface AIProviderStatus {
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

export interface AIError {
  code: string
  message: string
}

export interface AIConfig {
  backend: AIBackend
  openaiKey?: string
}
