import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { EmailModal } from '../../components/EmailModal'
import { SmartSearch } from '../../components/SmartSearch'

interface Bill {
  id: string
  number: string
  clientName: string
  clientEmail?: string
  issueDate: string
  dueDate?: string
  amount: string
  currency: string
  status: string
  filePath?: string
  folderPath?: string
  notes?: string
  paidAt?: string
  createdAt: string
  updatedAt: string
}

interface SearchFilters {
  text: string
  year?: string
  client?: string
  category?: string
  status?: string
  vendor?: string
}

interface Predictor {
  id: string
  label: string
  type: 'year' | 'client' | 'category' | 'status' | 'vendor' | 'custom'
  value: string
  count?: number
}

export default function BillsPage() {
  const navigate = useNavigate()
  const [bills, setBills] = useState<Bill[]>([])
  const [filteredBills, setFilteredBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [selectedBillForEmail, setSelectedBillForEmail] = useState<Bill | null>(null)
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({ text: '' })

  useEffect(() => {
    fetchBills()
  }, [])

  // Generate predictors from bills data
  const predictors = useMemo(() => {
    const preds: Predictor[] = []
    
    // Years
    const years = new Set<string>()
    const clients = new Map<string, number>()
    const statuses = new Map<string, number>()
    
    bills.forEach(bill => {
      // Extract year
      const year = new Date(bill.issueDate).getFullYear().toString()
      years.add(year)
      
      // Count clients
      clients.set(bill.clientName, (clients.get(bill.clientName) || 0) + 1)
      
      // Count statuses
      statuses.set(bill.status, (statuses.get(bill.status) || 0) + 1)
    })
    
    // Add year predictors
    Array.from(years).sort().reverse().forEach(year => {
      const count = bills.filter(b => new Date(b.issueDate).getFullYear().toString() === year).length
      preds.push({
        id: `year-${year}`,
        label: year,
        type: 'year',
        value: year,
        count
      })
    })
    
    // Add client predictors (top 10)
    Array.from(clients.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([client, count]) => {
        preds.push({
          id: `client-${client}`,
          label: client,
          type: 'client',
          value: client,
          count
        })
      })
    
    // Add status predictors
    Array.from(statuses.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        preds.push({
          id: `status-${status}`,
          label: status === 'PAID' ? 'Paid' : 'Unpaid',
          type: 'status',
          value: status,
          count
        })
      })
    
    return preds
  }, [bills])

  // Filter bills based on search
  useEffect(() => {
    let filtered = [...bills]
    
    // Text search (fuzzy search across multiple fields)
    if (searchFilters.text) {
      const query = searchFilters.text.toLowerCase()
      filtered = filtered.filter(bill => {
        const searchableText = [
          bill.number,
          bill.clientName,
          bill.clientEmail || '',
          bill.notes || '',
          bill.amount,
          new Date(bill.issueDate).toLocaleDateString()
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
      filtered = filtered.filter(bill => 
        new Date(bill.issueDate).getFullYear().toString() === searchFilters.year
      )
    }
    
    // Client filter
    if (searchFilters.client) {
      filtered = filtered.filter(bill => 
        bill.clientName === searchFilters.client
      )
    }
    
    // Status filter
    if (searchFilters.status) {
      filtered = filtered.filter(bill => 
        bill.status === searchFilters.status
      )
    }
    
    setFilteredBills(filtered)
  }, [bills, searchFilters])

  const handleSearch = (query: string, filters: SearchFilters) => {
    setSearchFilters(filters)
  }

  const fetchBills = async () => {
    try {
      if (!window.api) {
        setBills([])
        return
      }
      const result = await window.api.getBills()
      if ((result as any)?.error) {
        setBills([])
        return
      }
      const data = result as any
      setBills(data.bills || [])
    } catch (error) {
      // Fallback to empty list if API unavailable
      setBills([])
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePaid = async (bill: Bill) => {
    if (!window.api) return

    const newStatus = bill.status === 'PAID' ? 'DRAFT' : 'PAID'
    
    try {
      const result = await window.api.updateBillStatus(bill.id, newStatus)
      
      if (result.error) {
        alert(`Failed to update status: ${result.error.message}`)
        return
      }
      
      // Update local state immediately for better UX
      setBills(bills.map(b => 
        b.id === bill.id 
          ? { ...b, status: newStatus, paidAt: newStatus === 'PAID' ? new Date().toISOString() : undefined }
          : b
      ))
    } catch (error) {
      alert('Failed to update bill status')
    }
  }

  const handleDelete = async (bill: Bill) => {
    if (!window.api) return

    const confirmed = window.confirm(`Are you sure you want to delete bill ${bill.number}? This will move the bill folder to trash and remove it from the database.`)
    
    if (!confirmed) return

    try {
      const result = await window.api.deleteBill(bill.id)
      
      if (result.error) {
        alert(`Failed to delete bill: ${result.error.message}`)
        return
      }
      
      // Remove from local state
      setBills(bills.filter(b => b.id !== bill.id))
    } catch (error) {
      alert('Failed to delete bill')
    }
  }

  const handleSendEmail = (bill: Bill) => {
    setSelectedBillForEmail(bill)
    setEmailModalOpen(true)
  }

  const handleCloseEmailModal = () => {
    setEmailModalOpen(false)
    setSelectedBillForEmail(null)
  }

  const handleOpenFolder = async (folderPath: string) => {
    if (!window.api) return

    try {
      await window.api.openPath(folderPath)
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
      <div className="p-6 text-center min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading bills...</div>
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
        title="Bills" 
        subtitle="Manage your invoices and billing" 
        rightSlot={(
          <button 
            onClick={() => navigate('/bills/new')}
            className="btn btn-primary"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Bill
          </button>
        )} 
      />

      {/* Search */}
      <div className="mb-6">
        <SmartSearch
          placeholder="Search bills by client, number, amount..."
          onSearch={handleSearch}
          predictors={predictors}
          className="max-w-md"
        />
      </div>

      {/* Bills Table */}
      <div className="dashboard-card bg-card p-6">
        {bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <svg className="h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-card-foreground">
              No bills yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Create your first bill to get started with managing your invoices and billing.
            </p>
            <button 
              onClick={() => navigate('/bills/new')}
              className="btn btn-primary"
            >
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Bill
            </button>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <svg className="h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-card-foreground">
              No bills found
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              No bills match your search criteria. Try adjusting your search terms.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted border-b ">
                <th className="p-3 text-left font-semibold text-muted-foreground">Number</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Client</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Date</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Amount</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Status</th>
                <th className="p-3 text-left font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.map(bill => (
                <tr key={bill.id} className="border-b  hover:bg-muted/50 transition-colors">
                  <td className="p-3 font-medium text-card-foreground">
                    {bill.number}
                  </td>
                  <td className="p-3">
                    <div>
                      <div className="font-medium text-card-foreground">{bill.clientName}</div>
                      {bill.clientEmail && (
                        <div className="text-sm text-muted-foreground">{bill.clientEmail}</div>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-card-foreground">
                    {formatDate(bill.issueDate)}
                  </td>
                  <td className="p-3 font-medium text-card-foreground">
                    {formatCurrency(bill.amount, bill.currency)}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleTogglePaid(bill)}
                      className={`px-3 py-1 rounded-full border-none text-xs font-medium cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                        bill.status === 'PAID' 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' 
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}
                    >
                      {bill.status === 'PAID' ? '✓ Paid' : 'Unpaid'}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => navigate(`/bills/${bill.id}/view`)}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View
                      </button>
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => navigate(`/bills/${bill.id}/edit`)}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                      {bill.folderPath && (
                        <button 
                          className="btn btn-outline btn-sm"
                          onClick={() => handleOpenFolder(bill.folderPath!)}
                        >
                          <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          Open
                        </button>
                      )}
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => handleSendEmail(bill)}
                        disabled={!bill.clientEmail}
                        title={bill.clientEmail ? 'Send invoice via email' : 'Client email address not available'}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 3.26a2 2 0 001.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Send Email
                      </button>
                      <button 
                        className="btn btn-destructive btn-sm"
                        onClick={() => handleDelete(bill)}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
      
      <EmailModal
        isOpen={emailModalOpen}
        onClose={handleCloseEmailModal}
        bill={selectedBillForEmail}
      />
    </div>
  )
}
