import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function EditClientPage() {
  const navigate = useNavigate()
  const { id: clientId } = useParams<{ id: string }>()
  const [form, setForm] = useState({ name: '', email: '', taxId: '', address: '', phone: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        if (!window.api || !clientId) return
        const api: any = window.api
        const res = await api.getClient(clientId)
        if (!mounted) return
        if (res.error) throw new Error(res.error.message)
        const c = res.client
        setForm({
          name: c.name || '',
          email: c.email || '',
          taxId: c.taxId || '',
          address: c.address || '',
          phone: c.phone || ''
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load client')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [clientId])

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (!window.api) throw new Error('API not available')
      const api: any = window.api
      const res = await api.updateClient({ 
        id: clientId, 
        name: form.name.trim(), 
        email: form.email.trim() || undefined, 
        taxId: form.taxId.trim() || undefined, 
        address: form.address.trim() || undefined, 
        phone: form.phone.trim() || undefined 
      })
      if (res.error) throw new Error(res.error.message)
      navigate('/clients')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save client')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">← Back</button>
        <h1 className="text-3xl font-bold text-foreground m-0">Edit Client</h1>
      </div>

      <div className="apple-card bg-card p-8 max-w-xl">
        {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
        <form onSubmit={onSave} className="grid gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-card-foreground">Name *</label>
            <input 
              value={form.name} 
              onChange={e=>set('name', e.target.value)} 
              required 
              className="w-full p-3 rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-card-foreground">Email</label>
            <input 
              value={form.email} 
              onChange={e=>set('email', e.target.value)} 
              type="email" 
              className="w-full p-3 rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-card-foreground">Tax ID</label>
            <input 
              value={form.taxId} 
              onChange={e=>set('taxId', e.target.value)} 
              className="w-full p-3 rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-card-foreground">Address</label>
            <textarea 
              value={form.address} 
              onChange={e=>set('address', e.target.value)} 
              rows={2} 
              className="w-full p-3 rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-y" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-card-foreground">Phone</label>
            <input 
              value={form.phone} 
              onChange={e=>set('phone', e.target.value)} 
              className="w-full p-3 rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-border mt-2">
            <button type="button" onClick={()=>navigate(-1)} className="btn btn-secondary btn-lg">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary btn-lg">{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
