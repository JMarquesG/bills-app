import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'

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

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [formData, setFormData] = useState({
    vendor: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    notes: ''
  })
  const [formLoading, setFormLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    fetchExpenses()
  }, [])

  // Populate form when editing
  useEffect(() => {
    if (editingExpense) {
      setFormData({
        vendor: editingExpense.vendor || '',
        category: editingExpense.category || '',
        date: (editingExpense.date || '').slice(0, 10),
        amount: editingExpense.amount || '',
        notes: editingExpense.notes || ''
      })
      setShowForm(true)
    }
  }, [editingExpense])

  const startEdit = (expense: Expense) => {
    setEditingExpense(expense)
    setError(null)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingExpense(null)
    setFormData({
      vendor: '',
      category: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      notes: ''
    })
    setError(null)
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
        notes: formData.notes.trim() || undefined
      }

      let result
      if (editingExpense) {
        // Update existing expense
        result = await window.api.updateExpense({
          id: editingExpense.id,
          ...expenseData
        })
      } else {
        // Add new expense
        result = await window.api.addExpense(expenseData)
      }

      if (result.error) {
        setError(result.error.message)
        setFormLoading(false)
        return
      }

      // Reset form and refresh list
      cancelForm()
      fetchExpenses()
    } catch (error) {
      setError(editingExpense ? 'Failed to update expense' : 'Failed to add expense')
    }
    
    setFormLoading(false)
  }


  const handleAttachFile = async () => {
    if (!window.api || !editingExpense) return

    try {
      const result = await window.api.attachExpenseFile(editingExpense.id)
      
      if (result.error) {
        setError(result.error.message)
        return
      }
      
      if (!result.canceled && result.filePath) {
        // Update the editing expense with the new file path
        setEditingExpense(prev => prev ? { ...prev, filePath: result.filePath } : null)
        
        // Update the expenses list
        setExpenses(prev => prev.map(e => 
          e.id === editingExpense.id 
            ? { ...e, filePath: result.filePath }
            : e
        ))
        
        // Show success message
        alert('File attached successfully!')
      }
    } catch (error) {
      setError('Failed to attach file')
    }
  }

  const handleAutofillFromFile = async () => {
    if (!window.api || !editingExpense) return
    if (!editingExpense.filePath) return

    setExtracting(true)
    try {
      const res = await window.api.extractExpenseFields(editingExpense.id)
      if (res.error) {
        setError(res.error.message)
        setExtracting(false)
        return
      }
      const fields = (res as any).fields as Partial<typeof formData> | undefined
      if (fields) {
        setFormData(prev => ({
          vendor: fields.vendor ?? prev.vendor,
          category: fields.category ?? prev.category,
          date: fields.date ?? prev.date,
          amount: fields.amount ?? prev.amount,
          notes: fields.notes ?? prev.notes
        }))
        alert('Form fields updated from the attached file.')
      }
    } catch (e) {
      setError('Failed to extract fields from file')
    }
    setExtracting(false)
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

      {/* Add/Edit Expense Form */}
      {showForm && (
        <div className="apple-card bg-card p-6 mb-6 animate-fade-in">
          {error && (
            <div className="bg-destructive/10 border-destructive/20 rounded-xl p-3 mb-6 text-destructive text-sm">{error}</div>
          )}
          <h3 className="text-lg font-semibold text-card-foreground mb-5">
            {editingExpense ? 'Edit Expense' : 'Add New Expense'}
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

            <div className="flex gap-3 pt-2 border-t  mt-4">
              <button type="button" onClick={cancelForm} className="btn btn-secondary btn-lg">Cancel</button>
              {editingExpense && (
                <button 
                  type="button" 
                  onClick={handleAttachFile}
                  className="btn btn-outline btn-lg"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Attach File
                </button>
              )}
              {editingExpense && editingExpense.filePath && (
                <button 
                  type="button" 
                  onClick={handleAutofillFromFile}
                  className="btn btn-outline btn-lg"
                  disabled={extracting}
                  title="Extract fields from the attached document"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9M12 4h9M4 8h16M4 16h16M4 12h8" />
                  </svg>
                  {extracting ? 'Autofilling...' : 'Autofill from file'}
                </button>
              )}
              <button
                type="submit"
                disabled={formLoading}
                className="btn btn-primary btn-lg"
              >
                {formLoading 
                  ? (editingExpense ? 'Saving...' : 'Adding...')
                  : (editingExpense ? 'Save Changes' : 'Add Expense')
                }
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
              {expenses.map(expense => (
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
                        onClick={() => startEdit(expense)}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
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
