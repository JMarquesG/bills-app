'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../../components/PageHeader'

export default function NewBillPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    issueDate: new Date().toISOString().split('T')[0],
    amount: '',
    currency: 'EUR',
    number: '',
    notes: ''
  })
  const [pdfSource, setPdfSource] = useState<'auto' | 'file'>('auto')
  const [pickedFile, setPickedFile] = useState<string | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Auto-generate invoice number
  const generateInvoiceNumber = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    return `INV-${year}-${month}-${random}`
  }

  // Set default invoice number on component mount
  useState(() => {
    setFormData(prev => ({
      ...prev,
      number: generateInvoiceNumber()
    }))
  })

  // Load clients for selection
  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!window.api) return
      const api: any = window.api
      const res = await api.getClients()
      if (!mounted) return
      if (!res.error && res.clients) {
        setClients(res.clients)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  // Selected client object
  const selectedClient = useMemo(() => clients.find(c => c.id === formData.clientId) || null, [clients, formData.clientId])

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

      // Validate
      const validationErrors: string[] = []
      if (!(formData.clientId || formData.clientName.trim())) validationErrors.push('Client is required')
      if (!formData.amount.trim()) validationErrors.push('Amount is required')
      if (!formData.number.trim()) validationErrors.push('Invoice number is required')
      if (isNaN(parseFloat(formData.amount))) validationErrors.push('Amount must be a valid number')
      if (pdfSource === 'file' && !pickedFile) validationErrors.push('Please select a PDF file')

      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        setLoading(false)
        return
      }

      // Create bill via IPC
      const api: any = window.api
      const result = await api.createBill({
        clientId: formData.clientId || undefined,
        clientName: selectedClient?.name || formData.clientName.trim(),
        issueDate: formData.issueDate,
        amount: formData.amount.trim(),
        currency: formData.currency,
        number: formData.number.trim(),
        notes: formData.notes.trim() || undefined,
        source: pdfSource === 'auto' ? { type: 'auto' } : { type: 'file', path: pickedFile as string }
      })

      if (result.error) {
        setErrors([result.error.message])
        setLoading(false)
        return
      }

      // Success - redirect to bills list
      router.push('/bills')
    } catch (error) {
      setErrors(['Failed to create bill'])
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const pickPdf = async () => {
    if (!window.api) return
    const api: any = window.api
    const res = await api.pickPdf()
    if (!res.canceled && !res.error) {
      setPickedFile(res.path || null)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <PageHeader title="New Bill" subtitle="Create a new invoice for your client" />

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
            {/* Client */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-card-foreground">Client</label>
                <div className="text-xs text-muted-foreground flex gap-3">
                  <button type="button" onClick={() => router.push('/clients/new')} className="btn btn-link">Add client</button>
                  <button type="button" onClick={() => router.push('/clients')} className="btn btn-link">Manage clients</button>
                </div>
              </div>
              <div className="grid gap-2">
                <select
                  value={formData.clientId}
                  onChange={(e) => handleInputChange('clientId', e.target.value)}
                  className="w-full p-3 rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="">— Select client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {!formData.clientId && (
                  <input
                    type="text"
                    value={formData.clientName}
                    onChange={(e) => handleInputChange('clientName', e.target.value)}
                    placeholder="Or type client name"
                    className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                )}
              </div>
            </div>

            {/* Invoice Number and Issue Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Invoice Number *
                </label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => handleInputChange('number', e.target.value)}
                  placeholder="INV-2024-01-001"
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Issue Date *
                </label>
                <input
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => handleInputChange('issueDate', e.target.value)}
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Amount and Currency */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
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

              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Currency
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => handleInputChange('currency', e.target.value)}
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            {/* PDF Source */}
            <div>
              <label className="block text-sm font-medium mb-2 text-card-foreground">PDF Source</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPdfSource('auto')} className={`btn btn-sm ${pdfSource==='auto' ? 'btn-selected' : ''}`}>Auto-generate</button>
                <button type="button" onClick={() => setPdfSource('file')} className={`btn btn-sm ${pdfSource==='file' ? 'btn-selected' : ''}`}>Use existing PDF</button>
              </div>
              {pdfSource === 'file' && (
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={pickPdf} className="btn btn-secondary btn-sm">Pick PDF</button>
                  <span className="text-sm text-muted-foreground truncate max-w-[60ch]">{pickedFile || 'No file selected'}</span>
                </div>
              )}
              {pdfSource === 'auto' && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Auto mode uses your company profile. <button type="button" onClick={() => router.push('/settings/my-data')} className="btn btn-link">Set my data</button>
                </div>
              )}
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
                {loading ? 'Creating...' : 'Create Bill'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
