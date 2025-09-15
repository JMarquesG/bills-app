'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewExpensePage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    vendor: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    setLoading(true)

    try {
      if (!window.api) {
        setErrors(['API not available'])
        setLoading(false)
        return
      }

      // Ensure data root is configured so files and DB use the correct folder
      const status = await window.api.getStatus()
      if (status?.error) {
        setErrors([status.error.message])
        setLoading(false)
        return
      }
      if (!status?.hasSettings || !status?.dataRoot) {
        setErrors(['Please configure the data folder in Settings before adding expenses'])
        setLoading(false)
        return
      }

      // Validate
      const validationErrors: string[] = []
      if (!formData.vendor.trim()) validationErrors.push('Vendor is required')
      if (!formData.category.trim()) validationErrors.push('Category is required')
      if (!formData.date) validationErrors.push('Date is required')
      if (!formData.amount.trim()) validationErrors.push('Amount is required')
      if (isNaN(parseFloat(formData.amount))) validationErrors.push('Amount must be a valid number')

      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        setLoading(false)
        return
      }

      const result = await window.api.addExpense({
        vendor: formData.vendor.trim(),
        category: formData.category.trim(),
        date: formData.date,
        amount: formData.amount.trim(),
        notes: formData.notes.trim() || undefined
      })

      if (result.error) {
        setErrors([result.error.message])
        setLoading(false)
        return
      }

      router.push('/expenses')
    } catch (error) {
      setErrors(['Failed to create expense'])
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.back()}
            className="btn btn-surface btn-sm"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-foreground m-0">
            New Expense
          </h1>
        </div>
        <p className="text-muted-foreground">
          Add a new expense to your records
        </p>
      </div>

      {/* Form */}
      <div className="apple-card bg-card p-8 max-w-2xl">
        {errors.length > 0 && (
          <div className="bg-destructive/10 border-destructive/20 rounded-xl p-3 mb-6">
            {errors.map((error, idx) => (
              <div key={idx} className="text-destructive text-sm">
                {error}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5">
            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Vendor *
              </label>
              <input
                type="text"
                value={formData.vendor}
                onChange={(e) => handleInputChange('vendor', e.target.value)}
                placeholder="Enter vendor name"
                className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                required
              />
            </div>

            {/* Category and Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.00"
                className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                required
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Additional notes (optional)"
                rows={3}
                className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-y"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t  mt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-secondary btn-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-lg"
              >
                {loading ? 'Creating...' : 'Create Expense'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}


