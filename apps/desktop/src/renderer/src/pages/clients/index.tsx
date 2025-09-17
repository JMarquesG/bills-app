import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'

interface Client {
  id: string
  name: string
  email?: string
  taxId?: string
  address?: string
  phone?: string
  hidden?: boolean
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!window.api) return
      const api: any = window.api
      const res = await api.getClients()
      if (!mounted) return
      if (!res.error && res.clients) setClients(res.clients)
      setLoading(false)
    }
    run()
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <div className="p-6 text-center min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading clients...</div>
      </div>
    )
  }

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="text-muted-foreground">Manage your client information</p>
        </div>
        <button 
          onClick={() => navigate('/clients/new')}
          className="btn btn-primary"
        >
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Client
        </button>
      </div>

      <div className="dashboard-card bg-card p-6">
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-6 mb-4">
              <svg className="h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-card-foreground">
              No clients yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Add your first client to get started with managing your business relationships.
            </p>
            <button 
              onClick={() => navigate('/clients/new')}
              className="btn btn-primary"
            >
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Client
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map((client) => (
              <div key={client.id} className="flex items-center justify-between py-3 px-2 hover:bg-muted/40 rounded-lg transition-colors">
                <button 
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="flex-1 text-left no-underline bg-transparent border-none p-0"
                >
                  <div className="grid gap-1">
                    <div className="font-medium text-card-foreground">{client.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {client.email || '—'} {client.taxId ? `· ${client.taxId}` : ''}
                    </div>
                    {(client.address || client.phone) && (
                      <div className="text-xs text-muted-foreground">
                        {client.address || '—'} {client.phone ? `· ${client.phone}` : ''}
                      </div>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    title="Hide"
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (!window.api) return
                      const ok = confirm(`Hide client "${client.name}"? You can unhide only via DB for now.`)
                      if (!ok) return
                      const res = await window.api.hideClient(client.id)
                      if (!(res as any)?.error) {
                        setClients(prev => prev.filter(c => c.id !== client.id))
                      }
                    }}
                    className="btn btn-ghost"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="#9CA3AF" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>
                  </button>
                  <button
                    title="Delete"
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (!window.api) return
                      const ok = confirm(`Delete client "${client.name}"? This cannot be undone.`)
                      if (!ok) return
                      const res = await window.api.deleteClient(client.id)
                      if (!(res as any)?.error) {
                        setClients(prev => prev.filter(c => c.id !== client.id))
                      }
                    }}
                    className="btn btn-danger"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="#ef4444" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 001 1h8a1 1 0 001-1m-10 0V6a2 2 0 012-2h2a2 2 0 012 2v1"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
