import { useEffect, useState } from 'react'
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

export default function ViewBillPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [bill, setBill] = useState<Bill | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  // Load bill data
  useEffect(() => {
    const loadBill = async () => {
      if (!id || !window.api) return
      
      setLoading(true)
      try {
        const api: any = window.api
        const result = await api.getBill(id)
        
        if (result.error) {
          setErrors([result.error.message])
          return
        }
        
        if (result.bill) {
          setBill(result.bill)
          
          // Load PDF if file exists
          if (result.bill.filePath) {
            try {
              const pdfResult = await api.fileToDataUrl(result.bill.filePath)
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
        setLoading(false)
      }
    }
    
    loadBill()
  }, [id])

  const handleEditBill = () => {
    const confirmed = window.confirm('Si editamos la factura, la anterior será eliminada, ¿estás seguro?')
    if (confirmed && id) {
      navigate(`/bills/${id}/edit`)
    }
  }

  const handleOpenFolder = async () => {
    if (!window.api || !bill?.folderPath) return

    try {
      await window.api.openPath(bill.folderPath)
    } catch (error) {
      alert('Failed to open folder')
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
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-muted-foreground">Loading bill...</div>
      </div>
    )
  }

  if (errors.length > 0) {
    return (
      <div className="min-h-screen bg-background p-6">
        <PageHeader title="View Bill" subtitle="Bill information" />
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
              onClick={() => navigate('/bills')}
              className="btn btn-secondary"
            >
              Back to Bills
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-muted-foreground">Bill not found</div>
      </div>
    )
  }

    return (
      <div className="min-h-screen bg-background p-3 sm:p-6">
        <PageHeader 
          title="View Bill" 
          subtitle={`Bill ${bill.number}`}
          rightSlot={(
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/bills')}
                className="btn btn-secondary"
              >
                Back to Bills
              </button>
              <button
                onClick={handleEditBill}
                className="btn btn-primary"
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Bill
              </button>
            </div>
          )}
        />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Bill Information */}
        <div className="apple-card bg-card p-4 sm:p-6 lg:p-8">
          <h3 className="text-lg font-semibold text-card-foreground mb-6">Bill Information</h3>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Invoice Number
                </label>
                <div className="text-card-foreground font-medium text-lg">
                  {bill.number}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Status
                </label>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  bill.status === 'PAID' 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' 
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                }`}>
                  {bill.status === 'PAID' ? '✓ Paid' : 'Unpaid'}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Client
                </label>
                <div className="text-card-foreground font-medium">
                  {bill.clientName}
                </div>
                {bill.clientEmail && (
                  <div className="text-muted-foreground text-sm mt-1">
                    {bill.clientEmail}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Amount
                </label>
                <div className="text-card-foreground font-medium text-xl">
                  {formatCurrency(bill.amount, bill.currency)}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Issue Date
                </label>
                <div className="text-card-foreground">
                  {formatDate(bill.issueDate)}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Expected Payment Date
                </label>
                <div className="text-card-foreground">
                  {bill.expectedPaymentDate ? formatDate(bill.expectedPaymentDate) : 'Not set'}
                </div>
              </div>

              {bill.paidAt && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Paid At
                  </label>
                  <div className="text-card-foreground">
                    {formatDate(bill.paidAt)}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Created At
                </label>
                <div className="text-card-foreground text-sm">
                  {formatDate(bill.createdAt)}
                </div>
              </div>
            </div>

            {bill.description && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Description
                </label>
                <div className="text-card-foreground bg-muted/50 rounded-lg p-4 whitespace-pre-wrap break-words overflow-hidden">
                  {bill.description}
                </div>
              </div>
            )}

            {bill.notes && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Notes
                </label>
                <div className="text-card-foreground bg-muted/50 rounded-lg p-4 whitespace-pre-wrap break-words overflow-hidden">
                  {bill.notes}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t">
              <button
                onClick={handleEditBill}
                className="btn btn-primary"
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Bill
              </button>
              {bill.folderPath && (
                <button
                  onClick={handleOpenFolder}
                  className="btn btn-outline"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Open Folder
                </button>
              )}
            </div>
          </div>
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
                <div>No PDF available</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
