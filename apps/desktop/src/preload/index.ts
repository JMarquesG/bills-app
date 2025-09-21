import { contextBridge, ipcRenderer } from 'electron'

// API types for better TypeScript support
export interface BillInput {
  clientId?: string
  clientName: string
  issueDate: string
  expectedPaymentDate?: string
  amount: string
  currency?: string
  number: string
  description?: string
  notes?: string
  source: { type: 'auto' } | { type: 'file'; path: string }
}

export interface ExpenseInput {
  date: string
  amount: string
  vendor: string
  category: string
  invoiceId?: string
  notes?: string
}

export interface ApiResponse<T = any> {
  ok?: boolean
  error?: {
    code: string
    message: string
  }
  canceled?: boolean
  [key: string]: any
}

export interface AppStatus {
  hasSettings: boolean
  hasPassword: boolean
  dataRoot?: string
}

const api = {
  // Folder operations
  pickDataRoot: (): Promise<ApiResponse<{ path?: string }>> =>
    ipcRenderer.invoke('folder:pickDataRoot'),
    
  pickDataRootWithConfigCheck: (): Promise<ApiResponse<{ path?: string; hasExistingConfig?: boolean; autoLoaded?: boolean; config?: any; hasBackup?: boolean; backupSummary?: any }>> =>
    ipcRenderer.invoke('folder:pickDataRootWithConfigCheck'),
    
  checkAndLoadConfig: (folderPath: string): Promise<ApiResponse<{ hasExistingConfig: boolean; config?: any; autoLoaded?: boolean }>> =>
    ipcRenderer.invoke('folder:checkAndLoadConfig', folderPath),
    
  pickBillsRoot: (): Promise<ApiResponse<{ path?: string }>> =>
    ipcRenderer.invoke('folder:pickBillsRoot'),
  
  pickExpensesRoot: (): Promise<ApiResponse<{ path?: string }>> =>
    ipcRenderer.invoke('folder:pickExpensesRoot'),
  
  pickPdf: (): Promise<ApiResponse<{ path?: string }>> =>
    ipcRenderer.invoke('file:pickPdf'),
  fileToDataUrl: (path: string): Promise<ApiResponse<{ dataUrl: string }>> =>
    ipcRenderer.invoke('file:toDataUrl', path),
  
  ensureDir: (path: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('folder:ensureDir', path),
  
  // Bill operations
  createBill: (input: BillInput): Promise<ApiResponse<{ id: string; folderPath: string; filePath: string }>> =>
    ipcRenderer.invoke('bill:create', input),
  previewBill: (input: Omit<BillInput, 'source' | 'clientId'> & { clientId?: string; expectedPaymentDate?: string; description?: string }): Promise<ApiResponse<{ dataUrl: string }>> =>
    ipcRenderer.invoke('bill:preview', input),
  getBill: (id: string): Promise<ApiResponse<{ bill: any }>> =>
    ipcRenderer.invoke('bill:get', id),
  updateBill: (input: { id: string; clientName: string; issueDate: string; expectedPaymentDate?: string; amount: string; currency?: string; number: string; description?: string; notes?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('bill:update', input),
  
  deleteBill: (id: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('bill:delete', id),

  updateBillStatus: (id: string, status: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('bill:updateStatus', id, status),

  extractBillFields: (filePath: string): Promise<ApiResponse<{ fields?: { clientName?: string; issueDate?: string; expectedPaymentDate?: string; amount?: string; currency?: string; number?: string; description?: string; notes?: string } }>> =>
    ipcRenderer.invoke('bill:extractFields', filePath),
  
  // Expense operations
  addExpense: (input: ExpenseInput): Promise<ApiResponse<{ id: string }>> =>
    ipcRenderer.invoke('expense:add', input),
  getExpense: (id: string): Promise<ApiResponse<{ expense: any }>> =>
    ipcRenderer.invoke('expense:get', id),
  updateExpense: (input: { id: string; vendor: string; category: string; date: string; amount: string; notes?: string; invoiceId?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('expense:update', input),
  
  attachExpenseFile: (expenseId: string): Promise<ApiResponse<{ filePath?: string }>> =>
    ipcRenderer.invoke('expense:attachFile', expenseId),

  extractExpenseFields: (expenseId: string): Promise<ApiResponse<{ fields?: { vendor?: string; category?: string; date?: string; amount?: string; notes?: string } }>> =>
    ipcRenderer.invoke('expense:extractFields', expenseId),
  
  deleteExpense: (id: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('expense:delete', id),
  
  // App status and authentication
  getStatus: (): Promise<ApiResponse<AppStatus>> =>
    ipcRenderer.invoke('app:getStatus'),
  
  setPassword: (plainPassword: string | null): Promise<ApiResponse> =>
    ipcRenderer.invoke('auth:setPassword', plainPassword),
  
  changePassword: (currentPassword: string, newPassword: string | null): Promise<ApiResponse> =>
    ipcRenderer.invoke('auth:changePassword', currentPassword, newPassword),
  
  verifyPassword: (plainPassword: string): Promise<ApiResponse<{ valid: boolean }>> =>
    ipcRenderer.invoke('auth:verifyPassword', plainPassword),
  
  // Settings
  saveSettings: (data: { dataRoot?: string; billsRoot?: string; expensesRoot?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('settings:save', data),
    
  reconfigureDataRoot: (newDataRoot: string): Promise<ApiResponse<{ billsFolder: string; expensesFolder: string }>> =>
    ipcRenderer.invoke('settings:reconfigure', newDataRoot),
  
  getDataRoot: (): Promise<ApiResponse<{ path: string | null }>> =>
    ipcRenderer.invoke('settings:getDataRoot'),
  
  getBillsRoot: (): Promise<ApiResponse<{ path: string | null }>> =>
    ipcRenderer.invoke('settings:getBillsRoot'),
  
  getExpensesRoot: (): Promise<ApiResponse<{ path: string | null }>> =>
    ipcRenderer.invoke('settings:getExpensesRoot'),

  // OpenAI Key management
  getOpenAIKey: (): Promise<ApiResponse<{ key: string | null }>> =>
    ipcRenderer.invoke('settings:getOpenAIKey'),
  saveOpenAIKey: (apiKey: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('settings:saveOpenAIKey', { apiKey }),
  
  // System operations
  openPath: (path: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('system:openPath', path),
    
  // Data operations (IPC-based)
  getBills: (filters?: { status?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('data:getBills', filters),
    
  getExpenses: (filters?: { startDate?: string; endDate?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('data:getExpenses', filters),
    
  getStats: (): Promise<ApiResponse> =>
    ipcRenderer.invoke('data:getStats'),
    
  // Backup and Restore operations
  createBackup: (dataRootPath: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('data:createBackup', { dataRootPath }),
    
  checkForBackup: (dataRootPath: string): Promise<ApiResponse<{ hasBackup: boolean; backupPath?: string; summary?: any }>> =>
    ipcRenderer.invoke('data:checkForBackup', { dataRootPath }),
    
  resetAndRestore: (dataRootPath: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('data:resetAndRestore', { dataRootPath }),
    
  // Clients
  getClients: (): Promise<ApiResponse<{ clients: Array<{ id: string; name: string; email?: string; taxId?: string; address?: string; phone?: string }> }>> =>
    ipcRenderer.invoke('client:getAll'),
  createClient: (input: { name: string; email?: string; taxId?: string; address?: string; phone?: string }): Promise<ApiResponse<{ id: string }>> =>
    ipcRenderer.invoke('client:create', input),
  getClient: (id: string): Promise<ApiResponse<{ client: any }>> =>
    ipcRenderer.invoke('client:get', id),
  updateClient: (input: { id: string; name: string; email?: string; taxId?: string; address?: string; phone?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('client:update', input),
  hideClient: (id: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('client:hide', id),
  deleteClient: (id: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('client:delete', id),
  
  // Company profile (my data)
  getCompanyProfile: (): Promise<ApiResponse<{ profile: any }>> =>
    ipcRenderer.invoke('settings:getCompanyProfile'),
  saveCompanyProfile: (profile: any): Promise<ApiResponse> =>
    ipcRenderer.invoke('settings:saveCompanyProfile', profile),

  // SMTP configuration
  getSmtpConfig: (): Promise<ApiResponse<{ config: any }>> =>
    ipcRenderer.invoke('settings:getSmtpConfig'),
  saveSmtpConfig: (config: any): Promise<ApiResponse> =>
    ipcRenderer.invoke('settings:saveSmtpConfig', config),

  // Email operations
  sendInvoiceEmail: (data: { billId: string; subject: string; htmlBody: string; attachmentPath?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('email:sendInvoice', data),

  // Supabase / Sync
  getSupabaseConfig: (): Promise<ApiResponse<{ config: { url: string | null; key: string | null; enabled: boolean; lastSyncAt?: string | null; conflictPolicy: 'cloud_wins' | 'local_wins' } }>> =>
    ipcRenderer.invoke('settings:getSupabaseConfig'),
  saveSupabaseConfig: (config: { url: string; key: string; enabled?: boolean; conflictPolicy?: 'cloud_wins' | 'local_wins' }): Promise<ApiResponse> =>
    ipcRenderer.invoke('settings:saveSupabaseConfig', config),
  getSyncStatus: (): Promise<ApiResponse<{ configured: boolean; enabled: boolean; conflictPolicy: 'cloud_wins' | 'local_wins'; lastSyncAt?: string | null }>> =>
    ipcRenderer.invoke('sync:getStatus'),
  runSync: (): Promise<ApiResponse<{ pulled: number; pushed: number; files: { uploaded: number; downloaded: number } }>> =>
    ipcRenderer.invoke('sync:run'),
  setSyncConflictPolicy: (policy: 'cloud_wins' | 'local_wins'): Promise<ApiResponse> =>
    ipcRenderer.invoke('sync:setConflictPolicy', { policy }),
  diagnoseSync: (): Promise<ApiResponse<{ report: any }>> =>
    ipcRenderer.invoke('sync:diagnose'),
  initializeSupabase: (): Promise<ApiResponse> =>
    ipcRenderer.invoke('sync:initializeSupabase'),

  // Automation operations
  getAutomationRules: (): Promise<ApiResponse<{ rules: any[] }>> =>
    ipcRenderer.invoke('automation:getRules'),
  createAutomationRule: (rule: any): Promise<ApiResponse<{ id: string }>> =>
    ipcRenderer.invoke('automation:createRule', rule),
  updateAutomationRule: (rule: any): Promise<ApiResponse> =>
    ipcRenderer.invoke('automation:updateRule', rule),
  deleteAutomationRule: (id: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('automation:deleteRule', id),
  toggleAutomationRule: (id: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('automation:toggleRule', id),
  getDueAutomationRules: (): Promise<ApiResponse<{ rules: any[] }>> =>
    ipcRenderer.invoke('automation:getDueRules'),

  // AI operations (unified)
  analyzeDocument: (input: { filePath: string; documentType: 'expense' | 'bill'; extractionFields?: string[] }): Promise<ApiResponse<{ backend: 'local' | 'openai' | 'ollama'; confidence: number; fields: any }>> =>
    ipcRenderer.invoke('ai:analyzeDocument', input),
  extractText: (filePath: string): Promise<ApiResponse<{ text: string }>> =>
    ipcRenderer.invoke('ai:extractText', { filePath }),
  
  // AI status and control
  getAIStatus: (): Promise<ApiResponse<{ backend: 'local' | 'openai' | 'ollama'; localStatus: 'stopped' | 'starting' | 'running' | 'error'; openAiConfigured: boolean; currentProvider?: { status: 'stopped' | 'starting' | 'running' | 'error'; initialized: boolean; loading: boolean; error?: string; download?: { inProgress: boolean; percent?: number; completedBytes?: number; totalBytes?: number; message?: string } } }>> =>
    ipcRenderer.invoke('ai:getStatus'),
  startLocalAI: (): Promise<ApiResponse<{ status: string }>> =>
    ipcRenderer.invoke('ai:startLocal'),
  stopLocalAI: (): Promise<ApiResponse<{ status: string }>> =>
    ipcRenderer.invoke('ai:stopLocal'),
  setAIBackend: (backend: 'local' | 'openai' | 'ollama'): Promise<ApiResponse> =>
    ipcRenderer.invoke('ai:setBackend', backend),
  startOllamaAI: (): Promise<ApiResponse<{ status: string }>> =>
    ipcRenderer.invoke('ai:startOllama'),
  stopOllamaAI: (): Promise<ApiResponse<{ status: string }>> =>
    ipcRenderer.invoke('ai:stopOllama'),

  // Debug operations
  checkConfigFile: (): Promise<ApiResponse> =>
    ipcRenderer.invoke('debug:checkConfigFile'),
  checkDatabase: (): Promise<ApiResponse> =>
    ipcRenderer.invoke('debug:checkDatabase'),
  testPdfParsing: (filePath: string): Promise<ApiResponse<{ textLength: number; preview: string; analysis?: any }>> =>
    ipcRenderer.invoke('debug:testPdfParsing', filePath),
  diagnoseExtraction: (expenseId: string): Promise<ApiResponse<{ diagnosis: any }>> =>
    ipcRenderer.invoke('debug:diagnoseExtraction', expenseId)
}

// Expose API to renderer process
contextBridge.exposeInMainWorld('api', api)

// Type declaration for global window object
declare global {
  interface Window {
    api: typeof api
  }
}
