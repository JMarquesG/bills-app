// AI System Main Entry Point - Abstract Interface for Frontend

import { AIManager } from './manager'
import { DocumentType } from './types'

// Global AI Manager Instance
let aiManager: AIManager | null = null

export async function getAIManager(): Promise<AIManager> {
  if (!aiManager) {
    aiManager = new AIManager()
    await aiManager.initialize()
  }
  return aiManager
}

// Public API Functions (used by IPC handlers)

export async function analyzeDocument(filePath: string, documentType: DocumentType) {
  const manager = await getAIManager()
  return await manager.analyzeDocument(filePath, documentType)
}

export async function extractText(filePath: string) {
  const manager = await getAIManager()
  return await manager.extractText(filePath)
}

export async function getAIStatus() {
  const manager = await getAIManager()
  return await manager.getStatus()
}

export async function setAIBackend(backend:  'openai' | 'ollama') {
  const manager = await getAIManager()
  return await manager.setBackend(backend)
}

export async function getAIConfig() {
  const manager = await getAIManager()
  return await manager.getConfig()
}

export async function startLocalAI() {
  const manager = await getAIManager()
  return await manager.startLocal()
}

export async function stopLocalAI() {
  const manager = await getAIManager()
  return await manager.stopLocal()
}

export async function startOllamaAI() {
  const manager = await getAIManager()
  return await manager.startOllama()
}

export async function stopOllamaAI() {
  const manager = await getAIManager()
  return await manager.stopOllama()
}


export async function isAIReady(): Promise<boolean> {
  const manager = await getAIManager()
  const status = await manager.getStatus()
  return status.currentProvider.status === 'running'
}

// Cleanup function
export async function cleanupAI(): Promise<void> {
  if (aiManager) {
    await aiManager.cleanup()
    aiManager = null
  }
}

// Re-export types for convenience
export type { DocumentType, AIAnalysisResult, AIProvider, AIProviderStatus } from './types'
