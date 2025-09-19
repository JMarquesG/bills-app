import { ipcMain, app } from 'electron'
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import { createError } from './utils'
import { 
  analyzeDocument, 
  extractText, 
  getAIStatus, 
  setAIBackend, 
  startLocalAI, 
  stopLocalAI, 
  startOllamaAI,
  stopOllamaAI,
  isAIReady,
  DocumentType 
} from '../ai'

// Schemas for validation
const AnalyzeDocumentSchema = z.object({
  filePath: z.string().min(1),
  documentType: z.enum(['expense', 'bill']),
  extractionFields: z.array(z.string()).optional() // Optional field hints
})

const ExtractTextSchema = z.object({
  filePath: z.string().min(1)
})

// IPC Handlers

// Analyze document (unified interface)
ipcMain.handle('ai:analyzeDocument', async (_e, input: unknown) => {
  try {
    const data = AnalyzeDocumentSchema.parse(input)
    
    // Check if file exists
    try {
      await fs.access(data.filePath)
    } catch {
      return { error: { code: 'FILE_NOT_FOUND', message: 'File not found' } }
    }
    
    const result = await analyzeDocument(data.filePath, data.documentType as DocumentType)
    
    return { 
      backend: result.backend,
      confidence: result.confidence,
      fields: result.fields
    }
    
  } catch (error) {
    console.error('AI analysis error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    
    // Handle specific error types
    if (message.includes('401') || message.includes('authentication')) {
      return { error: { code: 'INVALID_API_KEY', message: 'Invalid OpenAI API key' } }
    } else if (message.includes('quota') || message.includes('limit')) {
      return { error: { code: 'API_QUOTA_EXCEEDED', message: 'API quota exceeded' } }
    } else if (message.includes('too large')) {
      return { error: { code: 'FILE_TOO_LARGE', message: 'File too large (max 20MB)' } }
    } else if (message.includes('OpenAI API key not configured')) {
      return { error: { code: 'OPENAI_KEY_MISSING', message: 'OpenAI API key not configured' } }
    }
    
    return createError('AI_ANALYSIS_ERROR', error)
  }
})

// Extract text via OCR (unified interface)
ipcMain.handle('ai:extractText', async (_e, input: unknown) => {
  try {
    const data = ExtractTextSchema.parse(input)
    
    // Check if file exists
    try {
      await fs.access(data.filePath)
    } catch {
      return { error: { code: 'FILE_NOT_FOUND', message: 'File not found' } }
    }
    
    try {
      const text = await extractText(data.filePath)
      return { text }
    } catch (error) {
      return { error: { code: 'OCR_ERROR', message: error instanceof Error ? error.message : 'Text extraction failed' } }
    }
    
  } catch (error) {
    return createError('OCR_ERROR', error)
  }
})

// AI Status and Control
ipcMain.handle('ai:getStatus', async () => {
  try {
    const status = await getAIStatus()
    return status
  } catch (error) {
    return createError('GET_AI_STATUS_ERROR', error)
  }
})

ipcMain.handle('ai:startLocal', async () => {
  try {
    await startLocalAI()
    const status = await getAIStatus()
    // status.localStatus is now a string ('running' | 'starting' | ...)
    return { ok: true, status: status.localStatus }
  } catch (error) {
    return createError('START_AI_ERROR', error)
  }
})

ipcMain.handle('ai:stopLocal', async () => {
  try {
    await stopLocalAI()
    const status = await getAIStatus()
    return { ok: true, status: status.localStatus }
  } catch (error) {
    return createError('STOP_AI_ERROR', error)
  }
})

// Settings
ipcMain.handle('ai:setBackend', async (_e, backend: string) => {
  try {
    const validatedBackend = z.enum(['local', 'openai', 'ollama']).parse(backend)
    await setAIBackend(validatedBackend)
    return { ok: true }
  } catch (error) {
    return createError('SET_AI_BACKEND_ERROR', error)
  }
})

// Ollama backend controls
ipcMain.handle('ai:startOllama', async () => {
  try {
    console.log('🟢 IPC: ai:startOllama requested')
    await startOllamaAI()
    const status = await getAIStatus()
    console.log('🟢 IPC: ai:startOllama status:', status)
    return { ok: true, status: status.currentProvider?.status || 'stopped' }
  } catch (error) {
    console.error('🔴 IPC: ai:startOllama error:', error)
    return createError('START_OLLAMA_AI_ERROR', error)
  }
})

ipcMain.handle('ai:stopOllama', async () => {
  try {
    console.log('🟡 IPC: ai:stopOllama requested')
    await stopOllamaAI()
    const status = await getAIStatus()
    console.log('🟡 IPC: ai:stopOllama status:', status)
    return { ok: true, status: status.currentProvider?.status || 'stopped' }
  } catch (error) {
    console.error('🔴 IPC: ai:stopOllama error:', error)
    return createError('STOP_OLLAMA_AI_ERROR', error)
  }
})

// Cleanup on app exit
app.on('before-quit', async () => {
  console.log('🤖 App closing, AI cleanup...')
  const { cleanupAI } = await import('../ai')
  await cleanupAI()
})
