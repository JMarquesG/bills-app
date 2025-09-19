// OpenAI Provider Implementation

import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { z } from 'zod'
import { AIProvider, DocumentType, AIAnalysisResult, AIProviderStatus } from '../types'

export class OpenAIProvider implements AIProvider {
  name = 'openai' as const
  private apiKey: string | null = null
  private isInitialized = false

  constructor(apiKey?: string) {
    if (apiKey) {
      this.apiKey = apiKey
      this.isInitialized = true
    }
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for initialization')
    }
    this.isInitialized = true
    console.log('✅ OpenAI provider initialized')
  }

  isReady(): boolean {
    return this.isInitialized && this.apiKey !== null
  }

  getStatus(): AIProviderStatus {
    if (this.isInitialized && this.apiKey) {
      return { status: 'running', initialized: true, loading: false }
    } else {
      return { status: 'stopped', initialized: false, loading: false }
    }
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey
    this.isInitialized = true
  }

  async analyzeDocument(filePath: string, documentType: DocumentType): Promise<AIAnalysisResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    try {
      console.log(`🔍 [OpenAI] Analyzing ${documentType} document:`, filePath)

      const { base64, mimeType } = await this.convertFileToBase64(filePath)

      // Check file size
      const fileStats = await fs.stat(filePath)
      const fileSizeMB = fileStats.size / (1024 * 1024)
      if (fileSizeMB > 20) {
        throw new Error('File is too large (max 20MB)')
      }

      // Set up OpenAI
      const prevKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = this.apiKey

      try {
        const { generateObject } = await import('ai')
        const { openai } = await import('@ai-sdk/openai')

        const schema = documentType === 'expense' 
          ? this.getExpenseSchema() 
          : this.getBillSchema()

        const promptText = documentType === 'expense' 
          ? this.getExpensePrompt()
          : this.getBillPrompt()

        const { object } = await generateObject({
          model: openai('gpt-4o-mini'),
          schema: schema as any,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image', image: `data:${mimeType};base64,${base64}` }
            ]
          }]
        })

        return {
          fields: object,
          text: '', // OpenAI doesn't extract raw text separately
          confidence: 0.9, // OpenAI typically has high confidence
          backend: 'openai',
          method: 'openai_vision'
        }

      } finally {
        if (prevKey === undefined) {
          delete process.env.OPENAI_API_KEY
        } else {
          process.env.OPENAI_API_KEY = prevKey
        }
      }

    } catch (error) {
      console.error('❌ [OpenAI] Document analysis failed:', error)
      throw error
    }
  }

  async extractText(filePath: string): Promise<string> {
    throw new Error('Text extraction not supported by OpenAI provider - use document analysis instead')
  }

  private async convertFileToBase64(filePath: string): Promise<{ base64: string; mimeType: string }> {
    const extension = extname(filePath).toLowerCase()
    const fileBuffer = await fs.readFile(filePath)
    const base64 = fileBuffer.toString('base64')

    let mimeType = 'application/octet-stream'
    switch (extension) {
      case '.pdf': mimeType = 'application/pdf'; break
      case '.jpg':
      case '.jpeg': mimeType = 'image/jpeg'; break
      case '.png': mimeType = 'image/png'; break
      case '.bmp': mimeType = 'image/bmp'; break
      case '.tiff':
      case '.tif': mimeType = 'image/tiff'; break
      case '.webp': mimeType = 'image/webp'; break
    }

    return { base64, mimeType }
  }

  private getExpenseSchema() {
    return z.object({
      vendor: z.string().optional(),
      category: z.string().optional(),
      date: z.string().optional(),
      amount: z.string().optional(),
      notes: z.string().optional()
    }).strict()
  }

  private getBillSchema() {
    return z.object({
      clientName: z.string().optional(),
      issueDate: z.string().optional(),
      expectedPaymentDate: z.string().optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      number: z.string().optional(),
      description: z.string().optional(),
      notes: z.string().optional()
    }).strict()
  }

  private getExpensePrompt(): string {
    return `You are a precise expense document analyzer. Analyze this document and extract structured information.

Instructions:
- Extract vendor/company name (who you paid)
- Determine appropriate expense category from: Office Supplies, Travel, Software, Equipment, Marketing, Meals, Utilities, Other
- Find the transaction date (convert to YYYY-MM-DD format)
- Identify the total amount (as decimal string like "123.45", without currency symbols), ensure it is in EUR
- Extract any relevant notes or description

Return ONLY the fields you can confidently identify. If unsure about a field, omit it.

Required JSON keys (all optional): vendor, category, date, amount, notes`
  }

  private getBillPrompt(): string {
    return `You are a precise invoice/bill document analyzer. Analyze this document and extract structured information.

Instructions:
- Extract client/customer name (who the bill is for)
- Find the issue date (convert to YYYY-MM-DD format)
- Find the due date or payment date (convert to YYYY-MM-DD format)
- Identify the total amount (as decimal string like "123.45", without currency symbols)
- Determine the currency (EUR, USD, GBP, etc.)
- Extract the invoice/bill number
- Get service or product description
- Extract any relevant notes or additional observations

Return ONLY the fields you can confidently identify. If unsure about a field, omit it.

Required JSON keys (all optional): clientName, issueDate, expectedPaymentDate, amount, currency, number, description, notes`
  }

  async cleanup(): Promise<void> {
    console.log('🤖 [OpenAI] Cleanup complete')
    // No cleanup needed for OpenAI
  }
}
