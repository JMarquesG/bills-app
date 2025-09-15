"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Profile = {
  name?: string
  address?: string
  email?: string
  phone?: string
  taxId?: string
  bankName?: string
  bankAccount?: string
  iban?: string
  swift?: string
}

export default function MyDataPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>({})
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!window.api) return
      const api: any = window.api
      const res = await api.getCompanyProfile()
      if (!mounted) return
      if (!res.error) setProfile(res.profile || {})
    }
    run()
    return () => { mounted = false }
  }, [])

  const set = (k: keyof Profile, v: string) => setProfile(prev => ({ ...prev, [k]: v }))

  const onSave = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (!window.api) throw new Error('API not available')
      const api: any = window.api
      const res = await api.saveCompanyProfile(profile)
      if (res.error) throw new Error(res.error.message)
      setMessage('Saved!')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold text-foreground m-0">My Data</h1>
      </div>

      <div className="apple-card bg-card p-8 max-w-2xl grid gap-4">
        {message && <div className="text-sm text-muted-foreground">{message}</div>}
        <Field label="Name" value={profile.name || ''} onChange={v=>set('name', v)} />
        <Field label="Address" value={profile.address || ''} onChange={v=>set('address', v)} />
        <Field label="Email" value={profile.email || ''} onChange={v=>set('email', v)} />
        <Field label="Phone" value={profile.phone || ''} onChange={v=>set('phone', v)} />
        <Field label="Tax ID" value={profile.taxId || ''} onChange={v=>set('taxId', v)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Bank Name" value={profile.bankName || ''} onChange={v=>set('bankName', v)} />
          <Field label="Bank Account" value={profile.bankAccount || ''} onChange={v=>set('bankAccount', v)} />
          <Field label="IBAN" value={profile.iban || ''} onChange={v=>set('iban', v)} />
          <Field label="SWIFT" value={profile.swift || ''} onChange={v=>set('swift', v)} />
        </div>
        <div className="flex gap-3 pt-2 border-t ">
          <button onClick={onSave} disabled={loading} className="btn btn-lg">{loading ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string)=>void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-card-foreground">{label}</label>
      <input value={value} onChange={e=>onChange(e.target.value)} className="w-full p-3  rounded-xl bg-background text-foreground" />
    </div>
  )
}
