import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'

export default function NewBillPage() {
  const navigate = useNavigate()
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
  const [pdfSource, setPdfSource] = useState<'auto' | 'file'>('auto')
  const [pickedFile, setPickedFile] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
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
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      number: prev.number || generateInvoiceNumber()
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Live preview (real-time on every input change)
  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        if (!window.api) return
        if (pdfSource !== 'auto') {
          if (pickedFile) {
            const res = await window.api.fileToDataUrl(pickedFile)
            if (active && !res.error) setPreviewUrl(res.dataUrl)
          }
          return
        }
        const clientName = selectedClient?.name || formData.clientName || 'Cliente'
        const amount = formData.amount && !isNaN(parseFloat(formData.amount)) ? formData.amount : '0'
        const number = formData.number || generateInvoiceNumber()
        if (!formData.number) {
          // persist generated number so the user sees it
          setFormData(prev => ({ ...prev, number }))
        }
        
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
          if (active && !res.error) setPreviewUrl(res.dataUrl)
        }
      } catch {}
    }
    // Reduced timeout for more responsive preview
    const t = setTimeout(run, 150)
    return () => { active = false; clearTimeout(t) }
  }, [formData, selectedClient, pdfSource, pickedFile])

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
      if (!formData.description.trim()) validationErrors.push('Description is required')
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
        expectedPaymentDate: formData.expectedPaymentDate,
        amount: formData.amount.trim(),
        currency: formData.currency,
        number: formData.number.trim(),
        description: formData.description.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        source: pdfSource === 'auto' ? { type: 'auto' } : { type: 'file', path: pickedFile as string }
      })

      if (result.error) {
        setErrors([result.error.message])
        setLoading(false)
        return
      }

      // Success - redirect to bills list
      navigate('/bills')
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

              <div>
                <label className="block text-sm font-medium mb-2 text-card-foreground">
                  Expected Payment Date
                </label>
                <input
                  type="date"
                  value={formData.expectedPaymentDate}
                  onChange={(e) => handleInputChange('expectedPaymentDate', e.target.value)}
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
                  Auto mode uses your company profile. <button type="button" onClick={() => navigate('/settings/my-data')} className="btn btn-link">Set my data</button>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2 text-card-foreground">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
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
                {loading ? 'Creating...' : 'Create Bill'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Preview */}
      <div className="apple-card bg-card p-4 xl:h-[calc(100vh-160px)]">
        <div className="text-sm font-medium text-card-foreground mb-2">PDF Preview</div>
        {previewUrl ? (
          <iframe 
            src={previewUrl} 
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
