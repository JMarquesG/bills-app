import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

export default function ViewExpensePage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [expense, setExpense] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  // Load expense data
  useEffect(() => {
    const loadExpense = async () => {
      if (!id || !window.api) return
      
      setLoading(true)
      try {
        const result = await window.api.getExpenses()
        
        if (result.error) {
          setErrors([result.error.message])
          return
        }
        
        if (result.expenses) {
          const foundExpense = result.expenses.find((e: Expense) => e.id === id)
          if (foundExpense) {
            setExpense(foundExpense)
          } else {
            setErrors(['Expense not found'])
          }
        }
      } catch (error) {
        setErrors([`Failed to load expense: ${error instanceof Error ? error.message : String(error)}`])
      } finally {
        setLoading(false)
      }
    }
    
    loadExpense()
  }, [id])

  const handleOpenFile = async () => {
    if (!window.api || !expense?.filePath) return

    try {
      await window.api.openPath(expense.filePath)
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
      <div className="min-h-screen bg-background p-3 sm:p-6 flex items-center justify-center">
        <div className="text-muted-foreground">Loading expense...</div>
      </div>
    )
  }

  if (errors.length > 0) {
    return (
      <div className="min-h-screen bg-background p-6">
        <PageHeader title="View Expense" subtitle="Expense information" />
        <div className="apple-card bg-card p-8 max-w-2xl">
          <div className="bg-destructive/10 border-destructive/20 rounded-xl p-3">
            {errors.map((error, idx) => (
              <div key={idx} className="text-destructive text-sm">
                {error}
              </div>
            ))}
          </div>
          <div className="mt-6">
            <button
              onClick={() => navigate('/expenses')}
              className="btn btn-secondary"
            >
              Back to Expenses
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-6 flex items-center justify-center">
        <div className="text-muted-foreground">Expense not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <PageHeader 
        title="View Expense" 
        subtitle={`Expense from ${expense.vendor}`}
        rightSlot={(
          <button
            onClick={() => navigate('/expenses')}
            className="btn btn-secondary"
          >
            Back to Expenses
          </button>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Expense Information */}
        <div className="apple-card bg-card p-4 sm:p-6 lg:p-8">
          <h3 className="text-lg font-semibold text-card-foreground mb-6">Expense Information</h3>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Vendor
                </label>
                <div className="text-card-foreground font-medium text-lg">
                  {expense.vendor}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Category
                </label>
                <span className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm font-medium">
                  {expense.category}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Date
                </label>
                <div className="text-card-foreground">
                  {formatDate(expense.date)}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Amount
                </label>
                <div className="text-card-foreground font-medium text-xl">
                  {formatCurrency(expense.amount, expense.currency)}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Invoice Number
                </label>
                <div className="text-card-foreground">
                  {expense.invoiceNumber || 'N/A'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Created At
                </label>
                <div className="text-card-foreground text-sm">
                  {formatDate(expense.createdAt)}
                </div>
              </div>
            </div>

            {expense.notes && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Notes
                </label>
                <div className="text-card-foreground bg-muted/50 rounded-lg p-4 whitespace-pre-wrap break-words overflow-hidden">
                  {expense.notes}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t">
              <button
                onClick={() => navigate('/expenses')}
                className="btn btn-secondary"
              >
                Back to Expenses
              </button>
              {expense.filePath && (
                <button
                  onClick={handleOpenFile}
                  className="btn btn-outline"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Open File
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Document Viewer */}
        <div className="apple-card bg-card p-4 xl:h-[calc(100vh-160px)]">
          <div className="text-sm font-medium text-card-foreground mb-2">Attached Document</div>
          {expense.filePath ? (
            <div className="h-[70vh] xl:h-full grid place-items-center text-muted-foreground text-sm">
              <div className="text-center">
                <svg className="h-16 w-16 text-muted-foreground mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="text-sm text-muted-foreground mb-4">Document attached</div>
                <button
                  onClick={handleOpenFile}
                  className="btn btn-outline"
                >
                  Open in System Viewer
                </button>
              </div>
            </div>
          ) : (
            <div className="h-[70vh] xl:h-full grid place-items-center text-muted-foreground text-sm">
              <div className="text-center">
                <svg className="h-12 w-12 text-muted-foreground mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>No document attached</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
