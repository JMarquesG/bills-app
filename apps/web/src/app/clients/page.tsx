"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '../../components/ui/Button'

export default function ClientsPage() {
  const [clients, setClients] = useState<Array<{ id: string; name: string; email?: string; taxId?: string; address?: string; phone?: string }>>([])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!window.api) return
      const api: any = window.api
      const res = await api.getClients()
      if (!mounted) return
      if (!res.error && res.clients) setClients(res.clients)
    }
    run()
    return () => { mounted = false }
  }, [])

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="text-muted-foreground">Manage your client information</p>
        </div>
        <Link href="/clients/new" className="btn btn-primary">
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Client
        </Link>
      </div>

      <div className="dashboard-card bg-card p-6">
        {clients.length === 0 ? (
          <div className="text-muted-foreground text-sm">No clients yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="no-underline">
                <div className="py-3 grid gap-1 hover:bg-muted/40 rounded-lg px-2">
                  <div className="font-medium text-card-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.email || '—'} {c.taxId ? `· ${c.taxId}` : ''}</div>
                  {(c.address || c.phone) && (
                    <div className="text-xs text-muted-foreground">{c.address || '—'} {c.phone ? `· ${c.phone}` : ''}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
