export interface BillInput {
  clientId?: string
  clientName: string
  issueDate: string
  expectedPaymentDate?: string
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

declare global {
  interface Window {
    api: {
      // Folder operations
      pickDataRoot: () => Promise<ApiResponse<{ path?: string }>>
      pickDataRootWithConfigCheck: () => Promise<ApiResponse<{ path?: string; hasExistingConfig?: boolean; autoLoaded?: boolean; config?: any }>>
      checkAndLoadConfig: (folderPath: string) => Promise<ApiResponse<{ hasExistingConfig: boolean; config?: any; autoLoaded?: boolean }>>
      pickBillsRoot: () => Promise<ApiResponse<{ path?: string }>>
      pickExpensesRoot: () => Promise<ApiResponse<{ path?: string }>>
      pickPdf: () => Promise<ApiResponse<{ path?: string }>>
      fileToDataUrl: (path: string) => Promise<ApiResponse<{ dataUrl: string }>>
      ensureDir: (path: string) => Promise<ApiResponse>
      
      // Bill operations
      createBill: (input: BillInput) => Promise<ApiResponse<{ id: string; folderPath: string; filePath: string }>>
      previewBill: (input: Omit<BillInput, 'source' | 'clientId'> & { clientId?: string }) => Promise<ApiResponse<{ dataUrl: string }>>
      getBill: (id: string) => Promise<ApiResponse<{ bill: any }>>
      updateBill: (input: { id: string; clientName: string; issueDate: string; expectedPaymentDate?: string; amount: string; currency?: string; number: string; notes?: string }) => Promise<ApiResponse>
      deleteBill: (id: string) => Promise<ApiResponse>
      updateBillStatus: (id: string, status: string) => Promise<ApiResponse>
      
      // Expense operations
      addExpense: (input: ExpenseInput) => Promise<ApiResponse<{ id: string }>>
      getExpense: (id: string) => Promise<ApiResponse<{ expense: any }>>
      updateExpense: (input: { id: string; vendor: string; category: string; date: string; amount: string; notes?: string; invoiceId?: string }) => Promise<ApiResponse>
      attachExpenseFile: (expenseId: string) => Promise<ApiResponse<{ filePath?: string }>>
      extractExpenseFields: (expenseId: string) => Promise<ApiResponse<{ fields?: { vendor?: string; category?: string; date?: string; amount?: string; notes?: string } }>>
      deleteExpense: (id: string) => Promise<ApiResponse>
      
      // App status and authentication
      getStatus: () => Promise<ApiResponse<AppStatus>>
      setPassword: (plainPassword: string | null) => Promise<ApiResponse>
      changePassword: (currentPassword: string, newPassword: string | null) => Promise<ApiResponse>
      verifyPassword: (plainPassword: string) => Promise<ApiResponse<{ valid: boolean }>>
      
      // Settings
      saveSettings: (data: { dataRoot?: string; billsRoot?: string; expensesRoot?: string }) => Promise<ApiResponse>
      reconfigureDataRoot: (newDataRoot: string) => Promise<ApiResponse<{ billsFolder: string; expensesFolder: string }>>
      getDataRoot: () => Promise<ApiResponse<{ path: string | null }>>
      getBillsRoot: () => Promise<ApiResponse<{ path: string | null }>>
      getExpensesRoot: () => Promise<ApiResponse<{ path: string | null }>>
      // OpenAI Key management
      getOpenAIKey: () => Promise<ApiResponse<{ key: string | null }>>
      saveOpenAIKey: (apiKey: string) => Promise<ApiResponse>
      
      // System operations
      openPath: (path: string) => Promise<ApiResponse>
      
      // Data operations (IPC-based)
      getBills: (filters?: { status?: string }) => Promise<ApiResponse>
      getExpenses: (filters?: { startDate?: string; endDate?: string }) => Promise<ApiResponse>
      getStats: () => Promise<ApiResponse> // returns { monthlyData, expectedMonthlyData, projectionNetNextYear, mlProjectionNetNextYear }
      
      // Clients
      getClients: () => Promise<ApiResponse<{ clients: Array<{ id: string; name: string; email?: string; taxId?: string; address?: string; phone?: string }> }>>
      createClient: (input: { name: string; email?: string; taxId?: string; address?: string; phone?: string }) => Promise<ApiResponse<{ id: string }>>
      getClient: (id: string) => Promise<ApiResponse<{ client: any }>>
      updateClient: (input: { id: string; name: string; email?: string; taxId?: string; address?: string; phone?: string }) => Promise<ApiResponse>
      hideClient: (id: string) => Promise<ApiResponse>
      deleteClient: (id: string) => Promise<ApiResponse>
      
      // Company profile (my data)
      getCompanyProfile: () => Promise<ApiResponse<{ profile: any }>>
      saveCompanyProfile: (profile: any) => Promise<ApiResponse>

      // Debug operations
      checkConfigFile: () => Promise<ApiResponse>
    }
  }
}
