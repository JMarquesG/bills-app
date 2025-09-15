'use client'

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
  const [formData, setFormData] = useState({
    vendor: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    notes: ''
  })
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    fetchExpenses()
  }, [])

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
      const result = await window.api.addExpense({
        vendor: formData.vendor.trim(),
        category: formData.category.trim(),
        date: formData.date,
        amount: formData.amount.trim(),
        notes: formData.notes.trim() || undefined
      })

      if (result.error) {
        alert(`Failed to add expense: ${result.error.message}`)
        setFormLoading(false)
        return
      }

      // Reset form and refresh list
      setFormData({
        vendor: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        notes: ''
      })
      setShowForm(false)
      fetchExpenses()
    } catch (error) {
      alert('Failed to add expense')
    }
    
    setFormLoading(false)
  }

  const handleAttachFile = async (expense: Expense) => {
    if (!window.api) return

    try {
      const result = await window.api.attachExpenseFile(expense.id)
      
      if (result.error) {
        alert(`Failed to attach file: ${result.error.message}`)
        return
      }

      if (!result.canceled) {
        // Refresh the expenses list
        fetchExpenses()
      }
    } catch (error) {
      alert('Failed to attach file')
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
    <div className="min-h-screen bg-background p-6">
      <PageHeader 
        title="Expenses" 
        subtitle="Track your business expenses"
        rightSlot={(
          <button
            onClick={() => setShowForm(!showForm)}
            className={`btn btn-lg ${showForm ? 'btn-selected' : ''}`}
          >
            {showForm ? 'Cancel' : '+ Add Expense'}
          </button>
        )}
      />

      {/* Add Expense Form */}
      {showForm && (
        <div className="apple-card bg-card p-6 mb-6 animate-fade-in">
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

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={formLoading}
                className={`px-4 py-2 border-none rounded-xl font-medium text-sm transition-all hover:scale-105 active:scale-95 ${
                  formLoading 
                    ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                    : 'bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700'
                }`}
              >
                {formLoading ? 'Adding...' : 'Add Expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses Table */}
      <div className="apple-card bg-card overflow-hidden">
        {expenses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-4">💰</div>
            <h3 className="text-lg font-semibold mb-2 text-card-foreground">
              No expenses yet
            </h3>
            <p className="text-muted-foreground mb-5">
              Add your first expense to start tracking
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-lg"
            >
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
                        onClick={() => handleAttachFile(expense)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800 rounded-lg text-xs cursor-pointer transition-all hover:bg-blue-200 dark:hover:bg-blue-900/50 hover:scale-105 active:scale-95"
                      >
                        📎 Attach
                      </button>
                      <button
                        onClick={() => handleDelete(expense)}
                        className="px-3 py-1.5 bg-destructive/10 text-destructive border-destructive/20 rounded-lg text-xs cursor-pointer transition-all hover:bg-destructive/20 hover:scale-105 active:scale-95"
                      >
                        🗑️ Delete
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
