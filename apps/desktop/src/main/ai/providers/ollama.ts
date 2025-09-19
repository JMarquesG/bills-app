// Ollama AI Provider - manages an Ollama subprocess and uses Gemma3 4B

import { spawn, SpawnOptionsWithoutStdio } from 'node:child_process'
import { platform } from 'node:os'
import { extname } from 'node:path'
import { request } from 'node:http'
import { AIProvider, DocumentType, AIAnalysisResult, AIProviderStatus } from '../types'
import { promises as fs } from 'node:fs'

type OllamaProcessState = {
  proc: import('node:child_process').ChildProcess | null
  starting: boolean
  error?: string
}

export class OllamaAIProvider implements AIProvider {
  name = 'ollama' as const

  private state: OllamaProcessState = { proc: null, starting: false }
  private initialized = false
  private modelReady = false
  private downloadState: { inProgress: boolean; percent?: number; completedBytes?: number; totalBytes?: number; message?: string } = { inProgress: false }
  private readonly modelName = 'gemma3:4b'
  private readonly baseUrl = 'http://127.0.0.1:11434'
  private ollamaPath?: string

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.state.error = undefined
    try {
      console.log('🤖 OllamaProvider: initialize start')
      // Ensure ollama is installed and server is running
      const hasBinary = await this.ensureOllamaInstalled()
      if (!hasBinary) {
        throw new Error(this.state.error || 'Ollama is not installed')
      }

      await this.ensureServerRunning()

      // Ensure model exists
      await this.ensureModelPulled()

      this.initialized = true
      console.log('✅ OllamaProvider: initialize completed')
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err)
      console.error('❌ OllamaProvider: initialize error', err)
      throw err
    }
  }

  isReady(): boolean {
    return this.initialized && !this.state.starting && !this.state.error && this.modelReady
  }

  getStatus(): AIProviderStatus {
    if (this.state.starting) {
      return { status: 'starting', initialized: this.initialized, loading: true, download: this.downloadState.inProgress ? this.downloadState : undefined }
    }
    if (this.state.error) {
      return { status: 'error', initialized: this.initialized, loading: false, error: this.state.error, download: this.downloadState.inProgress ? this.downloadState : undefined }
    }
    if (this.isReady()) {
      return { status: 'running', initialized: true, loading: false }
    }
    return { status: 'stopped', initialized: this.initialized, loading: false, download: this.downloadState.inProgress ? this.downloadState : undefined }
  }

  async warmup(): Promise<void> {
    await this.initialize()
  }

  async analyzeDocument(filePath: string, documentType: DocumentType): Promise<AIAnalysisResult> {
    const ext = extname(filePath).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      // Vision: send image path directly to Ollama
      const prompt = documentType === 'expense'
        ? 'Extract expense fields as JSON with these exact keys and types. Return ONLY JSON, no explanations. Schema: {"vendor": string, "category": string, "date": string(YYYY-MM-DD), "amount": string(decimal), "notes": string}. If a field is missing, return empty string.'
        : 'Extract bill fields as JSON with these exact keys and types. Return ONLY JSON, no explanations. Schema: {"clientName": string, "number": string, "issueDate": string(YYYY-MM-DD), "amount": string(decimal), "description": string}. If a field is missing, return empty string.'
      const resultText = await this.generate(prompt, [filePath])
      const fields = this.parseJsonFromText(resultText)
      return {
        fields,
        text: '[image]',
        confidence: Object.keys(fields).length ? 0.8 : 0.4,
        backend: 'ollama',
        method: 'ollama_gemma3_4b_image'
      }
    }

    // Non-image files (e.g., PDF): pass the file path via images array (Ollama will handle it)
    const prompt = documentType === 'expense'
      ? `Extract expense fields as JSON with these exact keys and types. Return ONLY JSON, no explanations. Schema: {"vendor": string, "category": string, "date": string(YYYY-MM-DD), "amount": string(decimal), "notes": string}. If a field is missing, return empty string.`
      : `Extract bill fields as JSON with these exact keys and types. Return ONLY JSON, no explanations. Schema: {"clientName": string, "number": string, "issueDate": string(YYYY-MM-DD), "amount": string(decimal), "description": string}. If a field is missing, return empty string.`

    let resultText = ''
    try {
      resultText = await this.generate(prompt, [filePath])
    } catch (e) {
      // Fallback: extract text and try again without images
      const text = await this.extractText(filePath)
      resultText = await this.generate(`${prompt}\n\nText (first 2000 chars):\n${text.substring(0, 2000)}\n\nJSON:`)
    }
    let fields = this.parseJsonFromText(resultText)
    if (!Object.keys(fields).length) {
      const retry = await this.generate(`Return ONLY valid JSON with the exact schema for ${documentType}.
${documentType === 'expense' ? '{"vendor":"","category":"","date":"","amount":"","notes":""}' : '{"vendor":"","invoice_number":"","date":"","amount":"","description":""}'}
Do not include any text other than the JSON.`)
      fields = this.parseJsonFromText(retry)
    }

    return {
      fields,
      text: '[file]',
      confidence: Object.keys(fields).length ? 0.7 : 0.4,
      backend: 'ollama',
      method: 'ollama_gemma3_4b_file'
    }
  }

  async extractText(filePath: string): Promise<string> {
    // Simple PDF text extraction using pdf-parse (same as Local provider)
    await fs.access(filePath)
    const pdfParse = require('pdf-parse')
    const buf = await fs.readFile(filePath)
    const data = await pdfParse(buf)
    if (!data.text || !data.text.trim()) {
      throw new Error('No extractable text found in PDF')
    }
    return data.text
  }

  async cleanup(): Promise<void> {
    // Stop subprocess if we started it
    if (this.state.proc) {
      try { this.state.proc.kill() } catch {}
      this.state.proc = null
    }
    this.initialized = false
    this.modelReady = false
  }

  // --- Internals ---

  private async ensureOllamaInstalled(): Promise<boolean> {
    console.log('🔎 OllamaProvider: resolving ollama binary')
    const resolved = await this.resolveOllamaPath()
    if (resolved) {
      this.ollamaPath = resolved
      console.log('🔎 OllamaProvider: resolved binary at', resolved)
      return true
    }
    // Do not auto-install; surface a clear error for the UI
    this.state.error = 'Ollama is not installed. Install with: brew install ollama (macOS) or see https://ollama.com for installers.'
    console.error('❌ OllamaProvider:', this.state.error)
    return false
  }

  private async ensureServerRunning(): Promise<void> {
    console.log('🚀 OllamaProvider: ensureServerRunning')
    if (await this.pingServer()) {
      console.log('🚀 OllamaProvider: server already up')
      return
    }
    // Start server in background
    this.state.starting = true
    const bin = this.ollamaPath || 'ollama'
    const proc = spawn(bin, ['serve'], {
      stdio: 'ignore',
      detached: true,
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
      }
    } as unknown as SpawnOptionsWithoutStdio)
    proc.on('error', (e) => {
      this.state.error = e instanceof Error ? e.message : String(e)
      console.error('❌ OllamaProvider: spawn error', e)
    })
    this.state.proc = proc
    proc.unref()

    // Wait for server to respond
    const start = Date.now()
    const timeoutMs = 60_000
    console.log('⏳ OllamaProvider: waiting for server to respond')
    while (Date.now() - start < timeoutMs) {
      if (await this.pingServer()) break
      await new Promise(r => setTimeout(r, 1000))
    }
    this.state.starting = false
    if (!(await this.pingServer())) {
      throw new Error('Ollama server failed to start')
    }
    console.log('✅ OllamaProvider: server is up')
  }

  private async ensureModelPulled(): Promise<void> {
    // Check tags
    console.log('📥 OllamaProvider: ensuring model', this.modelName)
    const tags = await this.httpJson('/api/tags').catch(() => null) as any
    const hasModel = !!tags?.models?.some((m: any) => m?.name?.startsWith('gemma3'))
    if (!hasModel) {
      console.log('⬇️  OllamaProvider: pulling model', this.modelName)
      await this.streamPullProgress(this.modelName, 10 * 60_000)
    }
    this.modelReady = true
    console.log('✅ OllamaProvider: model ready')
  }

  private async streamPullProgress(model: string, timeoutMs: number): Promise<void> {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    // Initialize progress snapshot
    let download: { inProgress: boolean; percent?: number; completedBytes?: number; totalBytes?: number; message?: string } = { inProgress: true, message: 'Starting download' }
    try {
      const res = await fetch(this.baseUrl + '/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true }),
        signal: controller.signal
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          try {
            const evt = JSON.parse(line)
            if (typeof evt.total === 'number') download.totalBytes = evt.total
            if (typeof evt.completed === 'number') download.completedBytes = evt.completed
            if (typeof evt.percent === 'number') download.percent = evt.percent
            if (typeof evt.status === 'string') download.message = evt.status
          } catch {}
        }
        // Write snapshot to state after each chunk
        this.downloadState = { ...download }
      }
    } finally {
      clearTimeout(t)
      // Mark complete
      this.downloadState = { inProgress: false }
    }
  }

  private async generate(prompt: string, images?: string[]): Promise<string> {
    await this.ensureServerRunning()
    await this.ensureModelPulled()
    const body: any = {
      model: this.modelName,
      prompt,
      stream: false,
      options: { temperature: 0.1 }
    }
    if (images && images.length) {
      body.images = images
    }
    const res = await this.httpJson('/api/generate', body, 120_000) as any
    const txt = res?.response || res?.message?.content || ''
    return String(txt)
  }

  private parseJsonFromText(txt: string): Record<string, any> {
    const match = txt.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch {}
    }
    return {}
  }

  private async pingServer(): Promise<boolean> {
    try {
      const res = await this.http('/api/version')
      return res === 200
    } catch { return false }
  }

  private http(path: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = request(this.baseUrl + path, { method: 'GET' }, (res) => {
        res.resume()
        resolve(res.statusCode || 0)
      })
      req.on('error', reject)
      req.end()
    })
  }

  private async httpJson(path: string, body?: any, timeoutMs = 30_000): Promise<unknown> {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(this.baseUrl + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const contentType = (res.headers.get('content-type') || '').toLowerCase()
      if (contentType.includes('application/json')) {
        return await res.json()
      }
      // Fallback: attempt to parse text as JSON or JSONL; otherwise return empty object
      const text = await res.text()
      try {
        return JSON.parse(text)
      } catch {}
      // Try to find a JSON object in the text (e.g., first or last)
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { return JSON.parse(match[0]) } catch {}
      }
      return {}
    } finally {
      clearTimeout(t)
    }
  }

  private async execCheck(cmd: string, args: string[]): Promise<{ ok: boolean }> {
    try {
      await this.execSpawn(cmd, args)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  private execSpawn(cmd: string, args: string[]): Promise<{ ok: boolean; code?: number }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { stdio: 'ignore' })
      child.on('error', () => resolve({ ok: false }))
      child.on('exit', (code) => resolve({ ok: code === 0, code: code ?? undefined }))
    })
  }

  private async resolveBinary(name: string): Promise<string | null> {
    // Try common locations first
    const candidates = [
      process.env[`${name.toUpperCase()}_BIN`],
      `/opt/homebrew/bin/${name}`,
      `/usr/local/bin/${name}`,
      `/usr/bin/${name}`
    ].filter(Boolean) as string[]
    for (const c of candidates) {
      try { await fs.access(c as string); return c as string } catch {}
    }
    // Try which/command -v
    try {
      const resolved = await new Promise<string | null>((resolve) => {
        const child = spawn('which', [name])
        let out = ''
        child.stdout?.on('data', (d) => { out += String(d) })
        child.on('exit', (code) => resolve(code === 0 ? out.trim() || null : null))
        child.on('error', () => resolve(null))
      })
      if (resolved) return resolved
    } catch {}
    return null
  }

  private async resolveOllamaPath(): Promise<string | null> {
    return await this.resolveBinary('ollama')
  }
}


