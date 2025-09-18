import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'

interface Bill {
  id: string
  number: string
  clientId: string
  clientName: string
  clientEmail?: string
  issueDate: string
  expectedPaymentDate?: string
  amount: string
  currency: string
  status: string
  filePath?: string
  folderPath?: string
  description?: string
  notes?: string
  paidAt?: string
  createdAt: string
  updatedAt: string
}

export default function EditBillPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    issueDate: new Date().toISOString().split('T')[0],
    expectedPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    amount: '',
    currency: 'EUR',
    number: '',
    description: '',
    notes: ''
  })
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [loadingBill, setLoadingBill] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  // Load bill data
  useEffect(() => {
    const loadBill = async () => {
      if (!id || !window.api) return
      
      setLoadingBill(true)
      try {
        const api: any = window.api
        const result = await api.getBill(id)
        
        if (result.error) {
          setErrors([result.error.message])
          return
        }
        
        if (result.bill) {
          const bill: Bill = result.bill
          // Helper function to format dates
          const formatDateForInput = (dateValue: any): string => {
            if (!dateValue) return new Date().toISOString().split('T')[0]
            
            // If it's already a string in YYYY-MM-DD format, return as is
            if (typeof dateValue === 'string') {
              if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return dateValue
              }
              // If it's an ISO string, split it
              return dateValue.split('T')[0]
            }
            
            // If it's a Date object
            if (dateValue instanceof Date) {
              return dateValue.toISOString().split('T')[0]
            }
            
            // Try to parse as date
            try {
              return new Date(dateValue).toISOString().split('T')[0]
            } catch {
              return new Date().toISOString().split('T')[0]
            }
          }
          
          setFormData({
            clientId: bill.clientId || '',
            clientName: bill.clientName || '',
            issueDate: formatDateForInput(bill.issueDate),
            expectedPaymentDate: formatDateForInput(bill.expectedPaymentDate) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            amount: bill.amount || '',
            currency: bill.currency || 'EUR',
            number: bill.number || '',
            description: bill.description || '',
            notes: bill.notes || ''
          })
          
          // Load PDF if file exists
          if (bill.filePath) {
            try {
              const pdfResult = await api.fileToDataUrl(bill.filePath)
              if (!pdfResult.error && pdfResult.dataUrl) {
                setPdfUrl(pdfResult.dataUrl)
              }
            } catch (error) {
              console.warn('Failed to load PDF:', error)
            }
          }
        }
      } catch (error) {
        setErrors([`Failed to load bill: ${error instanceof Error ? error.message : String(error)}`])
      } finally {
        setLoadingBill(false)
      }
    }
    
    loadBill()
  }, [id])

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

    // Show warning before proceeding with edit
    const confirmed = window.confirm('Si editamos la factura, la anterior será eliminada, ¿estás seguro?')
    if (!confirmed) {
      return
    }

    setLoading(true)

    try {
      if (!window.api || !id) {
        setErrors(['API not available or invalid bill ID'])
        setLoading(false)
        return
      }

      // Validate
      const validationErrors: string[] = []
      if (!(formData.clientId || formData.clientName.trim())) validationErrors.push('Client is required')
      if (!formData.amount.trim()) validationErrors.push('Amount is required')
      if (!formData.number.trim()) validationErrors.push('Invoice number is required')
      if (!formData.description.trim()) validationErrors.push('Description is required')
      if (isNaN(parseFloat(formData.amount))) validationErrors.push('Amount must be a valid number')

      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        setLoading(false)
        return
      }

      // Update bill via IPC
      const api: any = window.api
      const result = await api.updateBill({
        id,
        clientName: selectedClient?.name || formData.clientName.trim(),
        issueDate: formData.issueDate,
        expectedPaymentDate: formData.expectedPaymentDate,
        amount: formData.amount.trim(),
        currency: formData.currency,
        number: formData.number.trim(),
        description: formData.description.trim() || undefined,
        notes: formData.notes.trim() || undefined
      })

      if (result.error) {
        setErrors([result.error.message])
        setLoading(false)
        return
      }

      // Success - redirect to bills list
      navigate('/bills')
    } catch (error) {
      setErrors(['Failed to update bill'])
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }
  
  // Generate live PDF preview on form changes (same as New.tsx)
  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        if (!window.api) return
        
        const clientName = selectedClient?.name || formData.clientName || 'Cliente'
        const amount = formData.amount && !isNaN(parseFloat(formData.amount)) ? formData.amount : '0'
        const number = formData.number || 'INV-EDIT-001'
        
        // Only generate preview if we have minimal data
        if (clientName && amount && number) {
          const res = await window.api.previewBill({
            clientName,
            issueDate: formData.issueDate,
            expectedPaymentDate: formData.expectedPaymentDate,
            amount,
            currency: formData.currency,
            number,
            description: formData.description,
            notes: formData.notes
          })
          if (active && !res.error) setPdfUrl(res.dataUrl)
        }
      } catch {}
    }
    // Reduced timeout for responsive preview
    const t = setTimeout(run, 150)
    return () => { active = false; clearTimeout(t) }
  }, [formData, selectedClient])

  // Handle blur events to trigger PDF rendering
  const handleInputBlur = () => {
    // Trigger immediate PDF update on blur
    const run = async () => {
      try {
        if (!window.api) return
        
        const clientName = selectedClient?.name || formData.clientName || 'Cliente'
        const amount = formData.amount && !isNaN(parseFloat(formData.amount)) ? formData.amount : '0'
        const number = formData.number || 'INV-EDIT-001'
        
        if (clientName && amount && number) {
          const res = await window.api.previewBill({
            clientName,
            issueDate: formData.issueDate,
            expectedPaymentDate: formData.expectedPaymentDate,
            amount,
            currency: formData.currency,
            number,
            description: formData.description,
            notes: formData.notes
          })
          if (!res.error) setPdfUrl(res.dataUrl)
        }
      } catch {}
    }
    run()
  }

  if (loadingBill) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-muted-foreground">Loading bill...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <PageHeader title="Edit Bill" subtitle="Update invoice information" />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Form */}
      <div className="apple-card bg-card p-8 max-w-2xl w-full">
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
                  <button type="button" onClick={() => navigate('/clients/new')} className="btn btn-link">Add client</button>
                  <button type="button" onClick={() => navigate('/clients')} className="btn btn-link">Manage clients</button>
                </div>
              </div>
              <div className="grid gap-2">
                <select
                  value={formData.clientId}
                  onChange={(e) => handleInputChange('clientId', e.target.value)}
                  onBlur={handleInputBlur}
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
                    onBlur={handleInputBlur}
                    placeholder="Or type client name"
                    className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                )}
              </div>
            </div>

            {/* Invoice Number, Issue Date, Expected Payment */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Invoice Number *
                </label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => handleInputChange('number', e.target.value)}
                  onBlur={handleInputBlur}
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
                  onBlur={handleInputBlur}
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Expected Payment Date
                </label>
                <input
                  type="date"
                  value={formData.expectedPaymentDate}
                  onChange={(e) => handleInputChange('expectedPaymentDate', e.target.value)}
                  onBlur={handleInputBlur}
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
                  onBlur={handleInputBlur}
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
                  onBlur={handleInputBlur}
                  className="w-full p-3  rounded-xl text-base bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                onBlur={handleInputBlur}
                placeholder="Service or product description"
                rows={2}
                className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-y"
                required
              />
            </div>

            {/* Notes / Observations */}
            <div>
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Observations
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                onBlur={handleInputBlur}
                placeholder="Additional observations (optional)"
                rows={3}
                className="w-full p-3  rounded-xl text-base bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-y"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t  mt-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="btn btn-secondary btn-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-lg"
              >
                {loading ? 'Updating...' : 'Update Bill'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* PDF Preview */}
      <div className="apple-card bg-card p-4 xl:h-[calc(100vh-160px)]">
        <div className="text-sm font-medium text-card-foreground mb-2">PDF Preview</div>
        {pdfUrl ? (
          <iframe 
            src={pdfUrl} 
            className="w-full h-[70vh] xl:h-full rounded-lg border"
            title="Invoice Preview"
          />
        ) : (
          <div className="h-[70vh] xl:h-full grid place-items-center text-muted-foreground text-sm">
            <div className="text-center">
              <svg className="h-12 w-12 text-muted-foreground mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>Fill out the form to generate a preview</div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}