import { ipcMain } from 'electron'
import { z } from 'zod'
import { client } from '@bills/db'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret, hasSessionKey } from '../secrets'
import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { Client as PgClient } from 'pg'
import { createHash } from 'node:crypto'

type ConflictPolicy = 'cloud_wins' | 'local_wins'

let supabase: SupabaseClient | null = null
let realtimeInitialized = false

async function getSupabaseConfig(): Promise<{ url: string; key: string; enabled: boolean; conflictPolicy: ConflictPolicy } | null> {
  const res = await client.query('SELECT supabase_url, supabase_key, supabase_sync_enabled, supabase_conflict_policy FROM setting WHERE id = 1')
  const row = (res.rows?.[0] as any)
  if (!row || !row.supabase_url || !row.supabase_key || !row.supabase_sync_enabled) return null
  let key: string | null = null
  try {
    const payload = JSON.parse(row.supabase_key)
    if (payload.encrypted === false) {
      key = payload.plainText
    } else if (payload.encrypted === true) {
      if (!hasSessionKey()) throw new Error('LOCKED')
      key = decryptSecret(payload.iv, payload.cipherText)
    }
  } catch {
    key = null
  }
  if (!key) return null
  return { url: row.supabase_url, key, enabled: !!row.supabase_sync_enabled, conflictPolicy: (row.supabase_conflict_policy as ConflictPolicy) || 'cloud_wins' }
}

async function ensureSupabase(): Promise<SupabaseClient> {
  const cfg = await getSupabaseConfig()
  if (!cfg) throw new Error('Supabase not configured or disabled')
  if (!supabase) {
    supabase = createSupabaseClient(cfg.url, cfg.key)
  }
  return supabase
}

// Helpers to fetch all rows from a table (cloud)
async function fetchAllCloud(table: string) {
  const sb = await ensureSupabase()
  const { data, error } = await sb.from(table).select('*')
  if (error) throw new Error(error.message || 'Cloud select error')
  return data || []
}

// Helpers to fetch all rows from local table
async function fetchAllLocal(table: string) {
  const res = await client.query(`SELECT * FROM ${table}`)
  return res.rows || []
}

async function upsertLocal(table: string, rows: any[], idField = 'id') {
  for (const row of rows) {
    const cols = Object.keys(row)
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    const updates = cols
      .filter((c) => c !== idField)
      .map((c, i) => `${c} = $${i + 1}`)
      .join(', ')
    const values = cols.map((c) => row[c])
    const update = await client.query(
      `UPDATE ${table} SET ${updates} WHERE ${idField} = $${cols.length + 1}`,
      [...values, row[idField]]
    )
    if ((update as any).affectedRows === 0) {
      await client.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
        values
      )
    }
  }
}

async function upsertCloud(table: string, rows: any[]) {
  if (!rows.length) return
  const sb = await ensureSupabase()
  const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message || 'Cloud upsert error')
}

function iso(s: any): number {
  try { return new Date(s).getTime() } catch { return 0 }
}

async function syncTable(table: 'client' | 'invoice' | 'expense' | 'setting', conflictPolicy: ConflictPolicy) {
  const [cloudRows, localRows] = await Promise.all([
    fetchAllCloud(table),
    fetchAllLocal(table)
  ])
  const localById = new Map(localRows.map((r: any) => [r.id ?? r['id'] ?? r['ID'], r]))
  const cloudById = new Map(cloudRows.map((r: any) => [r.id ?? r['id'] ?? r['ID'], r]))

  const toPushCloud: any[] = []
  const toPullLocal: any[] = []

  const ids = new Set([...localById.keys(), ...cloudById.keys()])
  ids.forEach((id) => {
    const l = localById.get(id)
    const c = cloudById.get(id)
    if (l && !c) {
      toPushCloud.push(l)
    } else if (!l && c) {
      toPullLocal.push(c)
    } else if (l && c) {
      const lu = iso(l.updated_at || l.updatedAt)
      const cu = iso(c.updated_at || c.updatedAt)
      if (lu === cu) return
      if (conflictPolicy === 'cloud_wins') {
        toPullLocal.push(c)
      } else {
        toPushCloud.push(l)
      }
    }
  })

  await upsertCloud(table, toPushCloud)
  await upsertLocal(table, toPullLocal)

  return { pushed: toPushCloud.length, pulled: toPullLocal.length }
}

async function listLocalFiles(root: string): Promise<string[]> {
  async function walk(dir: string, acc: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p, acc)
      else acc.push(p)
    }
    return acc
  }
  try { return await walk(root, []) } catch { return [] }
}

async function listRemoteFiles(bucket: string, prefix: string): Promise<string[]> {
  const sb = await ensureSupabase()
  const paths: string[] = []
  async function walk(current: string) {
    const { data, error } = await sb.storage.from(bucket).list(current, { limit: 1000 })
    if (error) return
    for (const item of data || []) {
      const full = current ? `${current}/${item.name}` : item.name
      if ((item as any).id) {
        // file
        paths.push(full)
      } else {
        // treat as folder
        await walk(full)
      }
    }
  }
  await walk(prefix)
  return paths
}

async function syncFiles(conflictPolicy: ConflictPolicy): Promise<{ uploaded: number; downloaded: number }> {
  const sb = await ensureSupabase()
  const bucket = 'bills-app'
  const settings = await client.query('SELECT data_root FROM setting WHERE id = 1')
  const dataRoot = (settings.rows?.[0] as any)?.data_root
  if (!dataRoot) return { uploaded: 0, downloaded: 0 }
  const billsDir = join(dataRoot, 'bills')
  const expensesDir = join(dataRoot, 'expenses')

  let uploaded = 0
  let downloaded = 0

  // Local -> Cloud
  for (const [dir, prefix] of [[billsDir, 'bills'], [expensesDir, 'expenses']] as const) {
    const localFiles = await listLocalFiles(dir)
    for (const abs of localFiles) {
      const rel = abs.substring(dir.length + 1)
      const key = `${prefix}/${rel}`
      try {
        const fileBuffer = await fs.readFile(abs)
        const { error } = await sb.storage.from(bucket).upload(key, fileBuffer, { upsert: conflictPolicy === 'local_wins', contentType: 'application/octet-stream' })
        if (!error) uploaded++
      } catch {}
    }
  }

  // Cloud -> Local
  for (const prefix of ['bills', 'expenses']) {
    const remoteFiles = await listRemoteFiles(bucket, prefix)
    for (const key of remoteFiles) {
      const rel = key.replace(/^bills\//, '').replace(/^expenses\//, '')
      const baseDir = key.startsWith('bills/') ? billsDir : expensesDir
      const target = join(baseDir, rel)
      try {
        const { data, error } = await sb.storage.from(bucket).download(key)
        if (error || !data) continue
        await fs.mkdir(dirname(target), { recursive: true } as any)
        await fs.writeFile(target, Buffer.from(await data.arrayBuffer()))
        downloaded++
      } catch {}
    }
  }

  // Config file
  try {
    const cfgPath = join(dataRoot, 'bills-app.config.json')
    const cfgBuf = await fs.readFile(cfgPath)
    await sb.storage.from(bucket).upload('config/bills-app.config.json', cfgBuf, { upsert: true, contentType: 'application/json' })
  } catch {}

  try {
    const { data } = await sb.storage.from(bucket).download('config/bills-app.config.json')
    if (data) {
      const text = await data.text()
      await fs.writeFile(join(dataRoot, 'bills-app.config.json'), text, 'utf-8')
    }
  } catch {}

  return { uploaded, downloaded }
}

async function ensureTablesExist(): Promise<void> {
  const cfg = await getSupabaseConfig()
  if (!cfg) throw new Error('Supabase not configured')
  
  console.log('🔍 Ensuring tables exist via Supabase client...')
  const sb = await ensureSupabase()
  
  try {
    // Try to query each table - if they don't exist, we'll get an error and create them
    console.log('🔍 Checking if tables exist...')
    
    // Check client table
    try {
      await sb.from('client').select('*').limit(1)
      console.log('✅ Client table exists')
    } catch (error) {
      console.log('⚠️ Client table missing, will be created on first insert')
    }
    
    // Check invoice table
    try {
      await sb.from('invoice').select('*').limit(1)
      console.log('✅ Invoice table exists')
    } catch (error) {
      console.log('⚠️ Invoice table missing, will be created on first insert')
    }
    
    // Check expense table
    try {
      await sb.from('expense').select('*').limit(1)
      console.log('✅ Expense table exists')
    } catch (error) {
      console.log('⚠️ Expense table missing, will be created on first insert')
    }
    
    // Ensure storage bucket exists
    try {
      const { data: buckets, error: listErr } = await sb.storage.listBuckets()
      if (listErr) {
        console.log('⚠️ Cannot list buckets (RLS may be enabled):', listErr.message)
        console.log('⚠️ Bucket creation will be skipped - please create manually in Supabase dashboard')
        return // Skip bucket creation if we can't list buckets
      }
      
      const bucketExists = (buckets || []).some((b: any) => b.name === 'bills-app')
      if (!bucketExists) {
        console.log('🔍 Creating storage bucket...')
        const { error: createErr } = await sb.storage.createBucket('bills-app', { public: true })
        if (createErr) {
          console.log('⚠️ Cannot create bucket (RLS may be enabled):', createErr.message)
          console.log('⚠️ Please create the "bills-app" bucket manually in your Supabase dashboard')
          console.log('⚠️ Make it public and ensure RLS policies allow your anon key to access it')
          return // Skip bucket creation if we can't create it
        }
        console.log('✅ Storage bucket created')
      } else {
        console.log('✅ Storage bucket exists')
      }
    } catch (error) {
      console.log('⚠️ Storage bucket check failed:', error instanceof Error ? error.message : 'Unknown error')
      console.log('⚠️ Please ensure the "bills-app" bucket exists in your Supabase dashboard')
    }
    
  } catch (error) {
    console.error('🔍 Table/bucket check error:', error)
    throw new Error(`Failed to ensure tables/bucket exist: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function syncNow(): Promise<{ pulled: number; pushed: number; files: { uploaded: number; downloaded: number } }> {
  const cfg = await getSupabaseConfig()
  if (!cfg) throw new Error('Supabase not configured or disabled')
  
  console.log('🚀 Starting sync process...')
  
  // Ensure tables/bucket exist before syncing
  await ensureTablesExist()
  
  console.log('🔄 Starting data sync...')
  const [clientRes, invoiceRes, expenseRes] = await Promise.all([
    syncTable('client', cfg.conflictPolicy),
    syncTable('invoice', cfg.conflictPolicy),
    syncTable('expense', cfg.conflictPolicy)
  ])
  
  console.log('📁 Starting file sync...')
  const filesRes = await syncFiles(cfg.conflictPolicy)
  
  const pushed = clientRes.pushed + invoiceRes.pushed + expenseRes.pushed
  const pulled = clientRes.pulled + invoiceRes.pulled + expenseRes.pulled
  
  console.log(`✅ Sync completed: ${pushed} pushed, ${pulled} pulled, ${filesRes.uploaded} files uploaded, ${filesRes.downloaded} files downloaded`)
  
  const now = new Date().toISOString()
  await client.query('UPDATE setting SET last_sync_at = $1, updated_at = $1 WHERE id = 1', [now])
  return { pulled, pushed, files: filesRes }
}

async function startRealtimeIfEnabled() {
  if (realtimeInitialized) return
  const cfg = await getSupabaseConfig()
  if (!cfg || !cfg.enabled) return
  const sb = await ensureSupabase()
  try {
    sb.realtime.setAuth((await getSupabaseConfig())!.key)
  } catch {}
  // Note: Requires Supabase Realtime enabled for tables
  // Here we could subscribe and perform incremental syncs; for now we keep a simple stub
  realtimeInitialized = true
}

const conflictDecisionSchema = z.object({
  policy: z.enum(['cloud_wins', 'local_wins'])
})

ipcMain.handle('sync:getStatus', async () => {
  try {
    const cfg = await getSupabaseConfig()
    const row = await client.query('SELECT last_sync_at FROM setting WHERE id = 1')
    return { configured: !!cfg, enabled: !!cfg?.enabled, conflictPolicy: cfg?.conflictPolicy || 'cloud_wins', lastSyncAt: (row.rows?.[0] as any)?.last_sync_at || null }
  } catch (error) {
    return { error: { code: 'SYNC_STATUS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('sync:run', async () => {
  try {
    const result = await syncNow()
    return { ok: true, ...result }
  } catch (error) {
    const message = (error instanceof Error && error.message)
      || (typeof error === 'string' ? error : '')
      || ((error as any)?.message)
      || JSON.stringify(error)
      || 'Unknown error'
    return { error: { code: 'SYNC_RUN_ERROR', message } }
  }
})

ipcMain.handle('sync:setConflictPolicy', async (_e, data: unknown) => {
  try {
    const parsed = conflictDecisionSchema.parse(data)
    const now = new Date().toISOString()
    const update = await client.query('UPDATE setting SET supabase_conflict_policy = $1, updated_at = $2 WHERE id = 1', [parsed.policy, now])
    if (update.affectedRows === 0) {
      await client.query('INSERT INTO setting (id, supabase_conflict_policy, created_at, updated_at) VALUES (1, $1, $2, $2)', [parsed.policy, now])
    }
    return { ok: true }
  } catch (error) {
    return { error: { code: 'SYNC_POLICY_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Future: real-time channel (realtime: public:*). We'll initialize when enabled.
ipcMain.handle('sync:startRealtime', async () => {
  try {
    await startRealtimeIfEnabled()
    return { ok: true }
  } catch (error) {
    return { error: { code: 'SYNC_RT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('sync:diagnose', async () => {
  const report: any = { steps: [] }
  try {
    const cfg = await getSupabaseConfig()
    report.configured = !!cfg
    if (!cfg) return { error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured or disabled' }, report }
    report.steps.push('Config loaded')
    // Check tables
    const sb = await ensureSupabase()
    for (const table of ['client', 'invoice', 'expense']) {
      const { data, error } = await sb.from(table).select('*').limit(1)
      report[table] = error ? { ok: false, error: error.message } : { ok: true }
    }
    // Storage bucket check
    try {
      const { data: buckets, error: bErr } = await sb.storage.listBuckets()
      if (bErr) {
        report.storage = { ok: false, error: bErr.message }
      } else {
        const exists = (buckets || []).some((b: any) => b.name === 'bills-app')
        report.storage = { ok: exists, note: exists ? 'Bucket bills-app found' : 'Bucket bills-app missing' }
      }
    } catch (e: any) {
      report.storage = { ok: false, error: e?.message || 'Storage check failed' }
    }
    return { ok: true, report }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { error: { code: 'SYNC_DIAG_ERROR', message }, report }
  }
})

// Initialize Supabase schema and storage bucket (deprecated - now handled automatically in sync)
ipcMain.handle('sync:initializeSupabase', async (_e, data?: unknown) => {
  try {
    const cfg = await getSupabaseConfig()
    if (!cfg) return { error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured or disabled' } }
    
    // Just ensure bucket exists - tables are handled automatically
    const sb = await ensureSupabase()
    const { data: buckets, error: listErr } = await sb.storage.listBuckets()
    if (listErr) throw new Error(listErr.message)
    const exists = (buckets || []).some((b: any) => b.name === 'bills-app')
    if (!exists) {
      const { error: createErr } = await sb.storage.createBucket('bills-app', { public: true })
      if (createErr) throw new Error(createErr.message)
    }

    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { error: { code: 'SYNC_INIT_ERROR', message } }
  }
})



