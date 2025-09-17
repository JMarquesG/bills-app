import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'

interface AutomationRule {
  id: string
  clientId: string
  clientName: string
  clientEmail: string
  name: string
  dayOfMonth: number
  amount: string
  currency: string
  description: string
  subjectTemplate: string
  bodyTemplate: string
  isActive: boolean
  lastSentDate?: string
  nextDueDate?: string
  createdAt: string
  updatedAt: string
}

interface Client {
  id: string
  name: string
  email?: string
}

export default function AutomationPage() {
  const navigate = useNavigate()
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [formData, setFormData] = useState({
    clientId: '',
    name: '',
    dayOfMonth: 1,
    amount: '',
    currency: 'EUR',
    description: '',
    subjectTemplate: 'Factura {invoiceNumber} - {companyName}',
    bodyTemplate: `<p>Estimado/a {clientName},</p>

<p>Le adjuntamos la factura <strong>{invoiceNumber}</strong> por un importe de <strong>{amount}</strong>.</p>

<p>Concepto: {description}</p>

<p>Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.</p>

<p>Gracias por su confianza.</p>

<p>Saludos cordiales,<br>
{companyName}</p>`,
    isActive: true
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      if (!window.api) return
      
      // Load automation rules
      const rulesResult = await window.api.getAutomationRules()
      if (rulesResult.error) {
        setError(rulesResult.error.message)
      } else {
        setRules(rulesResult.rules || [])
      }
      
      // Load clients
      const clientsResult = await window.api.getClients()
      if (clientsResult.error) {
        setError(clientsResult.error.message)
      } else {
        setClients((clientsResult.clients || []).filter((c: Client) => c.email))
      }
    } catch (error) {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!window.api) return
    
    try {
      if (editingRule) {
        const result = await window.api.updateAutomationRule({
          id: editingRule.id,
          ...formData
        })
        if (result.error) {
          setError(result.error.message)
          return
        }
      } else {
        const result = await window.api.createAutomationRule(formData)
        if (result.error) {
          setError(result.error.message)
          return
        }
      }
      
      // Reset form and reload data
      setShowForm(false)
      setEditingRule(null)
      setFormData({
        clientId: '',
        name: '',
        dayOfMonth: 1,
        amount: '',
        currency: 'EUR',
        description: '',
        subjectTemplate: 'Factura {invoiceNumber} - {companyName}',
        bodyTemplate: `<p>Estimado/a {clientName},</p>

<p>Le adjuntamos la factura <strong>{invoiceNumber}</strong> por un importe de <strong>{amount}</strong>.</p>

<p>Concepto: {description}</p>

<p>Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.</p>

<p>Gracias por su confianza.</p>

<p>Saludos cordiales,<br>
{companyName}</p>`,
        isActive: true
      })
      
      await loadData()
    } catch (error) {
      setError('Failed to save automation rule')
    }
  }

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule)
    setFormData({
      clientId: rule.clientId,
      name: rule.name,
      dayOfMonth: rule.dayOfMonth,
      amount: rule.amount,
      currency: rule.currency,
      description: rule.description,
      subjectTemplate: rule.subjectTemplate,
      bodyTemplate: rule.bodyTemplate,
      isActive: rule.isActive
    })
    setShowForm(true)
  }

  const handleDelete = async (rule: AutomationRule) => {
    if (!window.api) return
    
    const confirmed = confirm(`Are you sure you want to delete automation rule "${rule.name}"?`)
    if (!confirmed) return
    
    try {
      const result = await window.api.deleteAutomationRule(rule.id)
      if (result.error) {
        setError(result.error.message)
      } else {
        await loadData()
      }
    } catch (error) {
      setError('Failed to delete automation rule')
    }
  }

  const handleToggle = async (rule: AutomationRule) => {
    if (!window.api) return
    
    try {
      const result = await window.api.toggleAutomationRule(rule.id)
      if (result.error) {
        setError(result.error.message)
      } else {
        await loadData()
      }
    } catch (error) {
      setError('Failed to toggle automation rule')
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

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('ca-ES')
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="text-muted-foreground">Loading automation rules...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <PageHeader 
        title="Invoice Automation" 
        subtitle="Automatically send recurring invoices to your clients"
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-6">
          <p className="text-red-800 dark:text-red-200 text-sm">
            ❌ {error}
          </p>
        </div>
      )}

      {clients.length === 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mb-6">
          <p className="text-yellow-800 dark:text-yellow-200 text-sm">
            ⚠️ You need to have clients with email addresses to create automation rules. 
            <button 
              onClick={() => navigate('/clients')}
              className="ml-2 underline hover:no-underline"
            >
              Manage clients
            </button>
          </p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">Automation Rules</h1>
        <button
          onClick={() => setShowForm(true)}
          disabled={clients.length === 0}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Automation Rule
        </button>
      </div>

      {/* Automation Rules Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-muted-foreground mb-4">
              <svg className="h-12 w-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>No automation rules configured</p>
            </div>
            {clients.length > 0 && (
              <button 
                onClick={() => setShowForm(true)}
                className="btn btn-primary"
              >
                Create Your First Automation Rule
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-muted border-b">
                <th className="p-4 text-left font-semibold text-muted-foreground">Status</th>
                <th className="p-4 text-left font-semibold text-muted-foreground">Rule Name</th>
                <th className="p-4 text-left font-semibold text-muted-foreground">Client</th>
                <th className="p-4 text-left font-semibold text-muted-foreground">Day of Month</th>
                <th className="p-4 text-left font-semibold text-muted-foreground">Amount</th>
                <th className="p-4 text-left font-semibold text-muted-foreground">Last Sent</th>
                <th className="p-4 text-left font-semibold text-muted-foreground">Next Due</th>
                <th className="p-4 text-left font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-4">
                    <button
                      onClick={() => handleToggle(rule)}
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        rule.isActive 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                      }`}
                    >
                      {rule.isActive ? '● Active' : '○ Inactive'}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-card-foreground">{rule.name}</div>
                    <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {rule.description}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-card-foreground">{rule.clientName}</div>
                    <div className="text-sm text-muted-foreground">{rule.clientEmail}</div>
                  </td>
                  <td className="p-4 text-card-foreground">
                    Day {rule.dayOfMonth}
                  </td>
                  <td className="p-4 font-medium text-card-foreground">
                    {formatCurrency(rule.amount, rule.currency)}
                  </td>
                  <td className="p-4 text-card-foreground">
                    {formatDate(rule.lastSentDate)}
                  </td>
                  <td className="p-4 text-card-foreground">
                    {formatDate(rule.nextDueDate)}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => handleEdit(rule)}
                      >
                        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                      <button 
                        className="btn btn-destructive btn-sm"
                        onClick={() => handleDelete(rule)}
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingRule ? 'Edit Automation Rule' : 'Create Automation Rule'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    placeholder="Monthly Service Invoice"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Client *
                  </label>
                  <select
                    value={formData.clientId}
                    onChange={(e) => handleFormChange('clientId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  >
                    <option value="">Select a client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>
                        {client.name} ({client.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Day of Month *
                  </label>
                  <input
                    type="number"
                    value={formData.dayOfMonth}
                    onChange={(e) => handleFormChange('dayOfMonth', parseInt(e.target.value) || 1)}
                    min="1"
                    max="31"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => handleFormChange('amount', e.target.value)}
                    placeholder="100.00"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Currency
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => handleFormChange('currency', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                      bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Monthly consulting services"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Subject Template *
                </label>
                <input
                  type="text"
                  value={formData.subjectTemplate}
                  onChange={(e) => handleFormChange('subjectTemplate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available variables: {'{invoiceNumber}'}, {'{clientName}'}, {'{companyName}'}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Body Template (HTML) *
                </label>
                <textarea
                  value={formData.bodyTemplate}
                  onChange={(e) => handleFormChange('bodyTemplate', e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                    font-mono text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available variables: {'{invoiceNumber}'}, {'{clientName}'}, {'{companyName}'}, {'{amount}'}, {'{description}'}
                </p>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => handleFormChange('isActive', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Active (automation will run)
                </label>
              </div>
            </form>
            
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingRule(null)
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 
                  hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md 
                  transition-colors"
              >
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
