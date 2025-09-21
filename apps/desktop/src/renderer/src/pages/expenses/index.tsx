import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { SmartSearch } from '../../components/SmartSearch'

interface Expense {
  id: string
  vendor: string
  category: string
  date: string
  amount: string
  currency: string
  filePath?: string
  notes?: string
  invoiceNumber?: string
  invoiceId?: string
  createdAt: string
  updatedAt: string
}

interface SearchFilters {
  text: string
  year?: string
  vendor?: string
  category?: string
}

interface Predictor {
  id: string
  label: string
  type: 'year' | 'vendor' | 'category' | 'custom'
  value: string
  count?: number
}

export default function ExpensesPage() {
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    vendor: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    notes: ''
  })
  const [formLoading, setFormLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({ text: '' })
  const [fileAttached, setFileAttached] = useState(false)
  const [attachedFilePath, setAttachedFilePath] = useState<string | null>(null)

  useEffect(() => {
    fetchExpenses()
  }, [])

  // Generate predictors from expenses data
  const predictors = useMemo(() => {
    const preds: Predictor[] = []
    
    // Years
    const years = new Set<string>()
    const vendors = new Map<string, number>()
    const categories = new Map<string, number>()
    
    expenses.forEach(expense => {
      // Extract year
      const year = new Date(expense.date).getFullYear().toString()
      years.add(year)
      
      // Count vendors
      vendors.set(expense.vendor, (vendors.get(expense.vendor) || 0) + 1)
      
      // Count categories
      categories.set(expense.category, (categories.get(expense.category) || 0) + 1)
    })
    
    // Add year predictors
    Array.from(years).sort().reverse().forEach(year => {
      const count = expenses.filter(e => new Date(e.date).getFullYear().toString() === year).length
      preds.push({
        id: `year-${year}`,
        label: year,
        type: 'year',
        value: year,
        count
      })
    })
    
    // Add vendor predictors (top 10)
    Array.from(vendors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([vendor, count]) => {
        preds.push({
          id: `vendor-${vendor}`,
          label: vendor,
          type: 'vendor',
          value: vendor,
          count
        })
      })
    
    // Add category predictors
    Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        preds.push({
          id: `category-${category}`,
          label: category,
          type: 'category',
          value: category,
          count
        })
      })
    
    return preds
  }, [expenses])

  // Filter expenses based on search
  useEffect(() => {
    let filtered = [...expenses]
    
    // Text search (fuzzy search across multiple fields)
    if (searchFilters.text) {
      const query = searchFilters.text.toLowerCase()
      filtered = filtered.filter(expense => {
        const searchableText = [
          expense.vendor,
          expense.category,
          expense.notes || '',
          expense.amount,
          new Date(expense.date).toLocaleDateString()
        ].join(' ').toLowerCase()
        
        // Simple fuzzy search - check if all characters exist in order
        let queryIndex = 0
        for (let i = 0; i < searchableText.length && queryIndex < query.length; i++) {
          if (searchableText[i] === query[queryIndex]) {
            queryIndex++
          }
        }
        return queryIndex === query.length || searchableText.includes(query)
      })
    }
    
    // Year filter
    if (searchFilters.year) {
      filtered = filtered.filter(expense => 
        new Date(expense.date).getFullYear().toString() === searchFilters.year
      )
    }
    
    // Vendor filter
    if (searchFilters.vendor) {
      filtered = filtered.filter(expense => 
        expense.vendor === searchFilters.vendor
      )
    }
    
    // Category filter
    if (searchFilters.category) {
      filtered = filtered.filter(expense => 
        expense.category === searchFilters.category
      )
    }
    
    setFilteredExpenses(filtered)
  }, [expenses, searchFilters])

  const handleSearch = (query: string, filters: SearchFilters) => {
    setSearchFilters(filters)
  }

  const cancelForm = () => {
    setShowForm(false)
    setFormData({
      vendor: '',
      category: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      notes: ''
    })
    setError(null)
    setFileAttached(false)
    setAttachedFilePath(null)
  }

  const handleAutofillFromFile = async () => {
    if (!window.api || !attachedFilePath) return

    setExtracting(true)
    setError(null)
    try {
      const res = await window.api.analyzeDocument({
        filePath: attachedFilePath,
        documentType: 'expense'
      })
      if (res.error) {
        setError(res.error.message)
        setExtracting(false)
        return
      }
      const fields = res.fields as Partial<typeof formData> | undefined
      if (fields) {
        setFormData(prev => ({
          ...prev,
          vendor: fields.vendor ?? prev.vendor,
          category: fields.category ?? prev.category,
          date: fields.date ?? prev.date,
          amount: fields.amount ?? prev.amount,
          notes: fields.notes ?? prev.notes
        }))
        
        const backendText = res.backend === 'openai' ? 'OpenAI' : 'Ollama'
        alert(`Form fields updated using ${backendText}`)
      }
    } catch (e) {
      setError('Failed to extract fields from file')
    }
    setExtracting(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api) return

    setFormLoading(true)

    try {
      const expenseData = {
        vendor: formData.vendor.trim(),
        category: formData.category.trim(),
        date: formData.date,
        amount: formData.amount.trim(),
        notes: formData.notes.trim() || undefined,
        filePath: attachedFilePath || undefined
      }

      // Add new expense
      const result = await window.api.addExpense(expenseData)

      if (result.error) {
        setError(result.error.message)
        setFormLoading(false)
        return
      }

      // Reset form and refresh list
      cancelForm()
      fetchExpenses()
    } catch (error) {
      setError('Failed to add expense')
    }
    
    setFormLoading(false)
  }

  const handleAttachFile = async () => {
    if (!window.api) return

    try {
      const result = await window.api.selectExpenseFile()
      
      if (result.error) {
        setError(result.error.message)
        return
      }
      
      if (!result.canceled && result.filePath) {
        setFileAttached(true)
        setAttachedFilePath(result.filePath as string)
        alert('File selected successfully! You can now add the expense.')
      }
    } catch (error) {
      setError('Failed to select file')
    }
  }

  const fetchExpenses = async () => {
    try {
      if (!window.api) {
        setExpenses([])
        setLoading(false)
        return
      }
      const result = await window.api.getExpenses()
      if (result.error) {
        setExpenses([])
        setLoading(false)
        return
      }
      setExpenses(result.expenses || [])
    } catch (error) {
      // Fallback to empty list if API unavailable
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (expense: Expense) => {
    if (!window.api) return

    const confirmed = window.confirm(`Are you sure you want to delete the expense from ${expense.vendor}? This will move any attached file to trash and remove it from the database.`)
    
    if (!confirmed) return

    try {
      const result = await window.api.deleteExpense(expense.id)
      
      if (result.error) {
        alert(`Failed to delete expense: ${result.error.message}`)
        return
      }
      
      // Remove from local state
      setExpenses(expenses.filter(e => e.id !== expense.id))
    } catch (error) {
      alert('Failed to delete expense')
    }
  }

  const handleOpenFile = async (filePath: string) => {
    if (!window.api) return

    try {
      await window.api.openPath(filePath)
    } catch (error) {
      alert('Failed to open file')
    }
  }

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount)
    return `${currency} ${num.toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="p-6 text-center min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading expenses...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center min-h-screen bg-background flex items-center justify-center">
        <div className="text-destructive">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <PageHeader 
        title="Expenses" 
        subtitle="Track your business expenses"
        rightSlot={(
          <button
            onClick={() => showForm ? cancelForm() : setShowForm(true)}
            className={`btn btn-lg ${showForm ? 'btn-selected' : ''}`}
          >
            {showForm ? 'Cancel' : '+ Add Expense'}
          </button>
        )}
      />

      {/* Search */}
      <div className="mb-6">
        <SmartSearch
          placeholder="Search expenses by vendor, category, amount..."
          onSearch={handleSearch}
          predictors={predictors}
          className="max-w-md"
        />
      </div>

      {/* Add Expense Form */}
      {showForm && (
        <div className="apple-card bg-card p-6 mb-6 animate-fade-in">
          {error && (
            <div className="bg-destructive/10 border-destructive/20 rounded-xl p-3 mb-6 text-destructive text-sm">{error}</div>
          )}
          <h3 className="text-lg font-semibold text-card-foreground mb-5">
            Add New Expense
          </h3>
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Vendor *
                </label>
                <input
                  type="text"
                  value={formData.vendor}
                  onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
                  placeholder="Enter vendor name"
                  className="w-full p-3  rounded-xl text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full p-3  rounded-xl text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                >
                  <option value="">Select category</option>
                  <option value="Office Supplies">Office Supplies</option>
                  <option value="Travel">Travel</option>
                  <option value="Software">Software</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Meals">Meals</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Date *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full p-3  rounded-xl text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full p-3  rounded-xl text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes (optional)"
                rows={2}
                className="w-full p-3  rounded-xl text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-y"
              />
            </div>

            {/* File attachment status */}
            {fileAttached && attachedFilePath && (
              <div className="mb-5 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                    File attached: {attachedFilePath.split('/').pop()}
                  </span>
                </div>
              </div>
            )}


            <div className="flex gap-3 pt-2 border-t  mt-4">
              <button type="button" onClick={cancelForm} className="btn btn-secondary btn-lg">Cancel</button>
              <button 
                type="button" 
                onClick={handleAutofillFromFile}
                disabled={!fileAttached || extracting}
                className="btn btn-outline btn-lg"
              >
                {extracting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI Analysis
                  </>
                )}
              </button>
              <button 
                type="button" 
                onClick={handleAttachFile}
                className={`btn btn-lg ${fileAttached ? 'btn-emerald' : 'btn-outline'}`}
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {fileAttached ? 'Change File' : 'Attach File'}
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="btn btn-primary btn-lg"
              >
                {formLoading ? 'Adding...' : 'Add Expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses Table */}
      <div className="dashboard-card bg-card p-6">
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <svg className="h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-card-foreground">
              No expenses yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Add your first expense to start tracking your business spending.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-primary"
            >
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Expense
            </button>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <svg className="h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-card-foreground">
              No expenses found
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              No expenses match your search criteria. Try adjusting your search terms.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted border-b ">
                <th className="p-3 text-left font-semibold text-muted-foreground">Date</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Vendor</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Category</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Amount</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">File</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map(expense => (
                <tr key={expense.id} className="border-b  hover:bg-muted/50 transition-colors">
                  <td className="p-3 text-card-foreground">
                    {formatDate(expense.date)}
                  </td>
                  <td className="p-3 font-medium text-card-foreground">
                    {expense.vendor}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-medium">
                      {expense.category}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-card-foreground">
                    {formatCurrency(expense.amount, expense.currency)}
                  </td>
                  <td className="p-3">
                    {expense.filePath ? (
                      <button
                        onClick={() => handleOpenFile(expense.filePath!)}
                        className="px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-none rounded-lg text-xs cursor-pointer transition-all hover:scale-105 active:scale-95"
                      >
                        📎 View
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => navigate(`/expenses/${expense.id}/view`)}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View
                      </button>
                      {expense.filePath && (
                        <button 
                          className="btn btn-outline btn-sm"
                          onClick={() => handleOpenFile(expense.filePath!)}
                        >
                          <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          Open
                        </button>
                      )}
                      <button 
                        className="btn btn-destructive btn-sm"
                        onClick={() => handleDelete(expense)}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0016.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
