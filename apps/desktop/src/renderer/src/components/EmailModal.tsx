import { useState, useEffect } from 'react'

interface Bill {
  id: string
  number: string
  clientName: string
  clientEmail?: string
  amount: string
  currency: string
  filePath?: string
}

interface EmailModalProps {
  isOpen: boolean
  onClose: () => void
  bill: Bill | null
}

export function EmailModal({ isOpen, onClose, bill }: EmailModalProps) {
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [sending, setSending] = useState(false)
  const [companyName, setCompanyName] = useState('')

  useEffect(() => {
    if (isOpen && bill) {
      // Load company profile to get company name
      loadCompanyProfile()
      
      // Set default subject
      setSubject(`Factura ${bill.number} - ${companyName || 'Your Company'}`)
      
      // Set default HTML body
      setHtmlBody(`
<p>Estimado/a ${bill.clientName},</p>

<p>Le adjuntamos la factura <strong>${bill.number}</strong> por un importe de <strong>${formatCurrency(bill.amount, bill.currency)}</strong>.</p>

<p>Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.</p>

<p>Gracias por su confianza.</p>

<p>Saludos cordiales,<br>
${companyName || 'Your Company'}</p>
      `.trim())
    }
  }, [isOpen, bill, companyName])

  const loadCompanyProfile = async () => {
    try {
      if (!window.api) return
      const result = await window.api.getCompanyProfile()
      if (!result.error && result.profile?.name) {
        setCompanyName(result.profile.name)
      }
    } catch (error) {
      console.error('Failed to load company profile:', error)
    }
  }

  const formatCurrency = (amount: string, currency: string) => {
    try {
      const value = parseFloat(amount)
      return new Intl.NumberFormat('ca-ES', {
        style: 'currency',
        currency: currency
      }).format(value)
    } catch {
      return `${amount} ${currency}`
    }
  }

  const handleSend = async () => {
    if (!bill || !window.api) return
    
    if (!bill.clientEmail) {
      alert('Client email address is not available')
      return
    }

    setSending(true)
    
    try {
      const result = await window.api.sendInvoiceEmail({
        billId: bill.id,
        subject,
        htmlBody,
        attachmentPath: bill.filePath
      })
      
      if (result.error) {
        alert(`Failed to send email: ${result.error.message}`)
      } else {
        alert(`Email sent successfully to ${bill.clientEmail}`)
        onClose()
      }
    } catch (error) {
      alert('Failed to send email')
    } finally {
      setSending(false)
    }
  }

  const handleCancel = () => {
    setSubject('')
    setHtmlBody('')
    onClose()
  }

  if (!isOpen || !bill) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Send Invoice via Email
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            To: {bill.clientEmail || 'No email available'}
          </p>
        </div>
        
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-4">
            {!bill.clientEmail && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <p className="text-sm text-red-800 dark:text-red-200">
                  ⚠️ This client doesn't have an email address configured. Please add an email address to the client profile first.
                </p>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={!bill.clientEmail}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email Body (HTML)
              </label>
              <textarea
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  font-mono text-sm resize-none"
                disabled={!bill.clientEmail}
              />
            </div>
            
            {bill.filePath && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  📎 The PDF invoice will be attached to this email.
                </p>
              </div>
            )}
          </div>
        </div>
        
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            onClick={handleCancel}
            disabled={sending}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 
              hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !bill.clientEmail || !subject.trim() || !htmlBody.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md 
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2"
          >
            {sending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 3.26a2 2 0 001.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
