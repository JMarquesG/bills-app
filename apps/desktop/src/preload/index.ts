import { contextBridge, ipcRenderer } from 'electron'

// API types for better TypeScript support
export interface BillInput {
  clientId?: string
  clientName: string
  issueDate: string
  amount: string
  currency?: string
  number: string
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
    
  pickBillsRoot: (): Promise<ApiResponse<{ path?: string }>> =>
    ipcRenderer.invoke('folder:pickBillsRoot'),
  
  pickExpensesRoot: (): Promise<ApiResponse<{ path?: string }>> =>
    ipcRenderer.invoke('folder:pickExpensesRoot'),
  
  pickPdf: (): Promise<ApiResponse<{ path?: string }>> =>
    ipcRenderer.invoke('file:pickPdf'),
  
  ensureDir: (path: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('folder:ensureDir', path),
  
  // Bill operations
  createBill: (input: BillInput): Promise<ApiResponse<{ id: string; folderPath: string; filePath: string }>> =>
    ipcRenderer.invoke('bill:create', input),
  
  deleteBill: (id: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('bill:delete', id),

  updateBillStatus: (id: string, status: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('bill:updateStatus', id, status),
  
  // Expense operations
  addExpense: (input: ExpenseInput): Promise<ApiResponse<{ id: string }>> =>
    ipcRenderer.invoke('expense:add', input),
  
  attachExpenseFile: (expenseId: string): Promise<ApiResponse<{ filePath?: string }>> =>
    ipcRenderer.invoke('expense:attachFile', expenseId),
  
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
    
  // Clients
  getClients: (): Promise<ApiResponse<{ clients: Array<{ id: string; name: string; email?: string; taxId?: string; address?: string; phone?: string }> }>> =>
    ipcRenderer.invoke('data:getClients'),
  createClient: (input: { name: string; email?: string; taxId?: string; address?: string; phone?: string }): Promise<ApiResponse<{ id: string }>> =>
    ipcRenderer.invoke('client:create', input),
  getClient: (id: string): Promise<ApiResponse<{ client: any }>> =>
    ipcRenderer.invoke('client:get', id),
  updateClient: (input: { id: string; name: string; email?: string; taxId?: string; address?: string; phone?: string }): Promise<ApiResponse> =>
    ipcRenderer.invoke('client:update', input),
  
  // Company profile (my data)
  getCompanyProfile: (): Promise<ApiResponse<{ profile: any }>> =>
    ipcRenderer.invoke('settings:getCompanyProfile'),
  saveCompanyProfile: (profile: any): Promise<ApiResponse> =>
    ipcRenderer.invoke('settings:saveCompanyProfile', profile),

  // Debug operations
  checkConfigFile: (): Promise<ApiResponse> =>
    ipcRenderer.invoke('debug:checkConfigFile')
}

// Expose API to renderer process
contextBridge.exposeInMainWorld('api', api)

// Type declaration for global window object
declare global {
  interface Window {
    api: typeof api
  }
}
