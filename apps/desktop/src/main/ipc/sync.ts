import { ipcMain } from 'electron'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { client } from '@bills/db'
import { z } from 'zod'

// Types for sync operations
interface SyncResult {
  success: boolean
  pushed: number
  pulled: number
  files?: {
    uploaded: number
    downloaded: number
  }
  error?: string
}

interface SyncStatus {
  configured: boolean
  enabled: boolean
  lastSyncAt?: string | null
}

interface ConflictPolicy {
  policy: 'cloud_wins' | 'local_wins'
}

// Database row types
interface ClientRow {
  id: string
  name: string
  email?: string
  address?: string
  phone?: string
  hidden: boolean
  tax_id?: string
  created_at: string
  updated_at: string
}

interface InvoiceRow {
  id: string
  number: string
  client_id: string
  issue_date: string
  due_date?: string
  expected_payment_date?: string
  amount: string
  currency: string
  status: string
  file_path?: string
  folder_path?: string
  description?: string
  notes?: string
  paid_at?: string
  created_at: string
  updated_at: string
}

interface ExpenseRow {
  id: string
  invoice_id?: string
  vendor: string
  category: string
  date: string
  amount: string
  currency: string
  file_path?: string
  notes?: string
  created_at: string
  updated_at: string
}

// Supabase client instance
let supabaseClient: SupabaseClient | null = null

// Real-time subscription handlers
const subscriptions = new Map<string, any>()

// Initialize Supabase client
async function initSupabaseClient(): Promise<SupabaseClient | null> {
  try {
    const result = await client.query(`
      SELECT supabase_url, supabase_key, supabase_sync_enabled 
      FROM setting WHERE id = 1
    `)
    
    const row = result.rows[0] as any
    if (!row?.supabase_url || !row?.supabase_key || !row?.supabase_sync_enabled) {
      return null
    }

    // Decrypt the key if needed
    let key = row.supabase_key
    try {
      const payload = JSON.parse(row.supabase_key)
      if (payload.encrypted === true) {
        // Key is encrypted, we need to decrypt it
        const { decryptSecret, hasSessionKey } = await import('../secrets')
        if (!hasSessionKey()) {
          throw new Error('Session key required to decrypt Supabase key')
        }
        key = decryptSecret(payload.iv, payload.cipherText)
      } else if (payload.encrypted === false) {
        key = payload.plainText
      }
    } catch {
      // If parsing fails, assume it's a plain text key
    }

    supabaseClient = createClient(row.supabase_url, key)
    return supabaseClient
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error)
    return null
  }
}

// Local changes always take precedence - no conflict policy needed

async function getSupabaseKeyRole(): Promise<string | null> {
  try {
    const result = await client.query(`SELECT supabase_key FROM setting WHERE id = 1`)
    const raw = (result.rows?.[0] as any)?.supabase_key
    if (!raw) return null
    let key: string | null = null
    try {
      const payload = JSON.parse(raw)
      if (payload.encrypted === false) key = payload.plainText
      if (payload.encrypted === true) {
        const { decryptSecret, hasSessionKey } = await import('../secrets')
        if (!hasSessionKey()) return null
        key = decryptSecret(payload.iv, payload.cipherText)
      }
    } catch {
      key = raw
    }
    if (!key) return null
    const parts = key.split('.')
    if (parts.length < 2) return null
    const body = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return body?.role || null
  } catch {
    return null
  }
}

// Sync clients
async function syncClients(): Promise<{ pushed: number; pulled: number }> {
  if (!supabaseClient) throw new Error('Supabase client not initialized')

  let pushed = 0
  let pulled = 0

  // Get local clients
  const localResult = await client.query('SELECT * FROM client ORDER BY created_at')
  const localClients = (localResult.rows || []) as ClientRow[]

  // Get remote clients
  const { data: remoteClients, error: fetchError } = await supabaseClient
    .from('client')
    .select('*')
    .order('created_at')

  if (fetchError) throw fetchError

  // Create a map of remote clients by id
  const remoteMap = new Map(remoteClients?.map((c: ClientRow) => [c.id, c]) || [])

  // Always push local changes to remote (local takes precedence)
  for (const localClient of localClients) {
    const remoteClient = remoteMap.get(localClient.id)
    
    if (!remoteClient) {
      // Client doesn't exist remotely, push it
      const { error } = await supabaseClient
        .from('client')
        .insert(localClient)
      
      if (error) {
        console.error('Failed to push client:', error)
      } else {
        pushed++
      }
    } else {
      // Client exists, always update remote with local version
      const { error } = await supabaseClient
        .from('client')
        .update(localClient)
        .eq('id', localClient.id)
      
      if (error) {
        console.error('Failed to update remote client:', error)
      } else {
        pushed++
      }
    }
  }

  // Pull new clients from remote
  for (const remoteClient of remoteClients || []) {
    const localExists = localClients.some((c: ClientRow) => c.id === remoteClient.id)
    
    if (!localExists) {
      // Client doesn't exist locally, pull it
      await client.query(`
        INSERT INTO client (id, name, email, address, phone, hidden, tax_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        remoteClient.id, remoteClient.name, remoteClient.email,
        remoteClient.address, remoteClient.phone, remoteClient.hidden,
        remoteClient.tax_id, remoteClient.created_at, remoteClient.updated_at
      ])
      pulled++
    }
  }

  return { pushed, pulled }
}

// Sync invoices
async function syncInvoices(): Promise<{ pushed: number; pulled: number }> {
  if (!supabaseClient) throw new Error('Supabase client not initialized')

  let pushed = 0
  let pulled = 0

  // Get local invoices
  const localResult = await client.query('SELECT * FROM invoice ORDER BY created_at')
  const localInvoices = (localResult.rows || []) as InvoiceRow[]

  // Get remote invoices
  const { data: remoteInvoices, error: fetchError } = await supabaseClient
    .from('invoice')
    .select('*')
    .order('created_at')

  if (fetchError) throw fetchError

  // Create a map of remote invoices by id
  const remoteMap = new Map(remoteInvoices?.map((i: InvoiceRow) => [i.id, i]) || [])

  // Always push local changes to remote (local takes precedence)
  for (const localInvoice of localInvoices) {
    const remoteInvoice = remoteMap.get(localInvoice.id)
    
    if (!remoteInvoice) {
      // Invoice doesn't exist remotely, push it
      const { error } = await supabaseClient
        .from('invoice')
        .insert(localInvoice)
      
      if (error) {
        console.error('Failed to push invoice:', error)
      } else {
        pushed++
      }
    } else {
      // Invoice exists, always update remote with local version
      const { error } = await supabaseClient
        .from('invoice')
        .update(localInvoice)
        .eq('id', localInvoice.id)
      
      if (error) {
        console.error('Failed to update remote invoice:', error)
      } else {
        pushed++
      }
    }
  }

  // Pull new invoices from remote
  for (const remoteInvoice of remoteInvoices || []) {
    const localExists = localInvoices.some((i: InvoiceRow) => i.id === remoteInvoice.id)
    
    if (!localExists) {
      // Invoice doesn't exist locally, pull it
      await client.query(`
        INSERT INTO invoice (id, number, client_id, issue_date, due_date, expected_payment_date, amount, currency, status, file_path, folder_path, description, notes, paid_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        remoteInvoice.id, remoteInvoice.number, remoteInvoice.client_id,
        remoteInvoice.issue_date, remoteInvoice.due_date, remoteInvoice.expected_payment_date,
        remoteInvoice.amount, remoteInvoice.currency, remoteInvoice.status,
        remoteInvoice.file_path, remoteInvoice.folder_path, remoteInvoice.description,
        remoteInvoice.notes, remoteInvoice.paid_at, remoteInvoice.created_at,
        remoteInvoice.updated_at
      ])
      pulled++
    }
  }

  return { pushed, pulled }
}

// Sync expenses
async function syncExpenses(): Promise<{ pushed: number; pulled: number }> {
  if (!supabaseClient) throw new Error('Supabase client not initialized')

  let pushed = 0
  let pulled = 0

  // Get local expenses
  const localResult = await client.query('SELECT * FROM expense ORDER BY created_at')
  const localExpenses = (localResult.rows || []) as ExpenseRow[]

  // Get remote expenses
  const { data: remoteExpenses, error: fetchError } = await supabaseClient
    .from('expense')
    .select('*')
    .order('created_at')

  if (fetchError) throw fetchError

  // Create a map of remote expenses by id
  const remoteMap = new Map(remoteExpenses?.map((e: ExpenseRow) => [e.id, e]) || [])

  // Always push local changes to remote (local takes precedence)
  for (const localExpense of localExpenses) {
    const remoteExpense = remoteMap.get(localExpense.id)
    
    if (!remoteExpense) {
      // Expense doesn't exist remotely, push it
      const { error } = await supabaseClient
        .from('expense')
        .insert(localExpense)
      
      if (error) {
        console.error('Failed to push expense:', error)
      } else {
        pushed++
      }
    } else {
      // Expense exists, always update remote with local version
      const { error } = await supabaseClient
        .from('expense')
        .update(localExpense)
        .eq('id', localExpense.id)
      
      if (error) {
        console.error('Failed to update remote expense:', error)
      } else {
        pushed++
      }
    }
  }

  // Pull new expenses from remote
  for (const remoteExpense of remoteExpenses || []) {
    const localExists = localExpenses.some((e: ExpenseRow) => e.id === remoteExpense.id)
    
    if (!localExists) {
      // Expense doesn't exist locally, pull it
      await client.query(`
        INSERT INTO expense (id, invoice_id, vendor, category, date, amount, currency, file_path, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        remoteExpense.id, remoteExpense.invoice_id, remoteExpense.vendor,
        remoteExpense.category, remoteExpense.date, remoteExpense.amount,
        remoteExpense.currency, remoteExpense.file_path, remoteExpense.notes,
        remoteExpense.created_at, remoteExpense.updated_at
      ])
      pulled++
    }
  }

  return { pushed, pulled }
}

// Main sync function
async function performSync(): Promise<SyncResult> {
  try {
    console.log('🔄 Starting sync operation...')
    
    // Initialize Supabase client
    const supabaseClientInstance = await initSupabaseClient()
    if (!supabaseClientInstance) {
      return { success: false, pushed: 0, pulled: 0, error: 'Supabase not configured or enabled' }
    }

    supabaseClient = supabaseClientInstance

    // Perform sync for each table
    const clientsResult = await syncClients()
    const invoicesResult = await syncInvoices()
    const expensesResult = await syncExpenses()

    const totalPushed = clientsResult.pushed + invoicesResult.pushed + expensesResult.pushed
    const totalPulled = clientsResult.pulled + invoicesResult.pulled + expensesResult.pulled

    // Update last sync timestamp
    await client.query(`
      UPDATE setting SET last_sync_at = current_timestamp WHERE id = 1
    `)

    console.log(`✅ Sync completed: ${totalPushed} pushed, ${totalPulled} pulled`)
    
    return {
      success: true,
      pushed: totalPushed,
      pulled: totalPulled,
      files: { uploaded: 0, downloaded: 0 } // File sync not implemented yet
    }
  } catch (error) {
    console.error('❌ Sync failed:', error)
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: error instanceof Error ? error.message : 'Unknown sync error'
    }
  }
}

// Merge Pull: insert only new records from cloud into local
async function mergePull(): Promise<SyncResult> {
  try {
    const supabaseClientInstance = await initSupabaseClient()
    if (!supabaseClientInstance) {
      return { success: false, pushed: 0, pulled: 0, error: 'Supabase not configured or enabled' }
    }
    supabaseClient = supabaseClientInstance

    let pulled = 0
    let pushed = 0

    // Clients
    const localClientsRes = await client.query('SELECT id FROM client')
    const existingClientIds = new Set<string>((localClientsRes.rows || []).map((r: any) => r.id))
    const { data: remoteClients, error: rcErr } = await supabaseClient.from('client').select('*')
    if (rcErr) throw rcErr
    for (const c of remoteClients || []) {
      if (!existingClientIds.has(c.id)) {
        await client.query(`
          INSERT INTO client (id, name, email, address, phone, hidden, tax_id, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [c.id, c.name, c.email, c.address, c.phone, c.hidden, c.tax_id, c.created_at, c.updated_at])
        pulled++
      }
    }

    // Invoices
    const localInvRes = await client.query('SELECT id FROM invoice')
    const existingInvIds = new Set<string>((localInvRes.rows || []).map((r: any) => r.id))
    const { data: remoteInvoices, error: riErr } = await supabaseClient.from('invoice').select('*')
    if (riErr) throw riErr
    for (const i of remoteInvoices || []) {
      if (!existingInvIds.has(i.id)) {
        await client.query(`
          INSERT INTO invoice (id, number, client_id, issue_date, due_date, expected_payment_date, amount, currency, status, file_path, folder_path, description, notes, paid_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        `, [i.id, i.number, i.client_id, i.issue_date, i.due_date, i.expected_payment_date, i.amount, i.currency, i.status, i.file_path, i.folder_path, i.description, i.notes, i.paid_at, i.created_at, i.updated_at])
        pulled++
      }
    }

    // Expenses
    const localExpRes = await client.query('SELECT id FROM expense')
    const existingExpIds = new Set<string>((localExpRes.rows || []).map((r: any) => r.id))
    const { data: remoteExpenses, error: reErr } = await supabaseClient.from('expense').select('*')
    if (reErr) throw reErr
    for (const e of remoteExpenses || []) {
      if (!existingExpIds.has(e.id)) {
        await client.query(`
          INSERT INTO expense (id, invoice_id, vendor, category, date, amount, currency, file_path, notes, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [e.id, e.invoice_id, e.vendor, e.category, e.date, e.amount, e.currency, e.file_path, e.notes, e.created_at, e.updated_at])
        pulled++
      }
    }

    await client.query('UPDATE setting SET last_sync_at = current_timestamp WHERE id = 1')
    return { success: true, pushed, pulled }
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Merge Push: insert only new records from local into cloud
async function mergePush(): Promise<SyncResult> {
  try {
    const supabaseClientInstance = await initSupabaseClient()
    if (!supabaseClientInstance) {
      return { success: false, pushed: 0, pulled: 0, error: 'Supabase not configured or enabled' }
    }
    supabaseClient = supabaseClientInstance

    let pushed = 0
    let pulled = 0

    // Clients
    const { data: remoteClients, error: rcErr } = await supabaseClient.from('client').select('id')
    if (rcErr) throw rcErr
    const remoteClientIds = new Set<string>((remoteClients || []).map((r: any) => r.id))
    const localClientsRes = await client.query('SELECT * FROM client')
    for (const c of (localClientsRes.rows || [])) {
      if (!remoteClientIds.has((c as any).id)) {
        const { error } = await supabaseClient.from('client').insert(c as any)
        if (!error) pushed++
      }
    }

    // Invoices
    const { data: remoteInvoices, error: riErr } = await supabaseClient.from('invoice').select('id')
    if (riErr) throw riErr
    const remoteInvIds = new Set<string>((remoteInvoices || []).map((r: any) => r.id))
    const localInvRes = await client.query('SELECT * FROM invoice')
    for (const i of (localInvRes.rows || [])) {
      if (!remoteInvIds.has((i as any).id)) {
        const { error } = await supabaseClient.from('invoice').insert(i as any)
        if (!error) pushed++
      }
    }

    // Expenses
    const { data: remoteExpenses, error: reErr } = await supabaseClient.from('expense').select('id')
    if (reErr) throw reErr
    const remoteExpIds = new Set<string>((remoteExpenses || []).map((r: any) => r.id))
    const localExpRes = await client.query('SELECT * FROM expense')
    for (const e of (localExpRes.rows || [])) {
      if (!remoteExpIds.has((e as any).id)) {
        const { error } = await supabaseClient.from('expense').insert(e as any)
        if (!error) pushed++
      }
    }

    await client.query('UPDATE setting SET last_sync_at = current_timestamp WHERE id = 1')
    return { success: true, pushed, pulled }
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Force Pull: replace local DB with cloud DB
async function forcePull(): Promise<SyncResult> {
  try {
    const supabaseClientInstance = await initSupabaseClient()
    if (!supabaseClientInstance) {
      return { success: false, pushed: 0, pulled: 0, error: 'Supabase not configured or enabled' }
    }
    supabaseClient = supabaseClientInstance

    // Fetch remote data
    const [clients, invoices, expenses, settings] = await Promise.all([
      supabaseClient.from('client').select('*'),
      supabaseClient.from('invoice').select('*'),
      supabaseClient.from('expense').select('*'),
      supabaseClient.from('setting').select('*')
    ])
    if (clients.error) throw clients.error
    if (invoices.error) throw invoices.error
    if (expenses.error) throw expenses.error
    if (settings.error) throw settings.error

    await client.transaction(async (tx: any) => {
      // Clear local (respect FKs): automation_rule -> expense -> invoice -> client -> setting
      await tx.query('DELETE FROM automation_rule')
      await tx.query('DELETE FROM expense')
      await tx.query('DELETE FROM invoice')
      await tx.query('DELETE FROM client')
      await tx.query('DELETE FROM setting')

      // Restore settings first
      for (const s of settings.data || []) {
        await tx.query(`
          INSERT INTO setting (id, data_root, bills_root, expenses_root, filename_tpl, security, company_profile, smtp_config, openai_key, ai_backend, supabase_url, supabase_key, supabase_sync_enabled, last_sync_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        `, [s.id, s.data_root, s.bills_root, s.expenses_root, s.filename_tpl, s.security, s.company_profile, s.smtp_config, s.openai_key, s.ai_backend, s.supabase_url, s.supabase_key, s.supabase_sync_enabled, s.last_sync_at, s.created_at, s.updated_at])
      }

      // Clients
      for (const c of clients.data || []) {
        await tx.query(`
          INSERT INTO client (id, name, email, address, phone, hidden, tax_id, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [c.id, c.name, c.email, c.address, c.phone, c.hidden, c.tax_id, c.created_at, c.updated_at])
      }

      // Invoices
      for (const i of invoices.data || []) {
        await tx.query(`
          INSERT INTO invoice (id, number, client_id, issue_date, due_date, expected_payment_date, amount, currency, status, file_path, folder_path, description, notes, paid_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        `, [i.id, i.number, i.client_id, i.issue_date, i.due_date, i.expected_payment_date, i.amount, i.currency, i.status, i.file_path, i.folder_path, i.description, i.notes, i.paid_at, i.created_at, i.updated_at])
      }

      // Expenses
      for (const e of expenses.data || []) {
        await tx.query(`
          INSERT INTO expense (id, invoice_id, vendor, category, date, amount, currency, file_path, notes, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [e.id, e.invoice_id, e.vendor, e.category, e.date, e.amount, e.currency, e.file_path, e.notes, e.created_at, e.updated_at])
      }
    })

    await client.query('UPDATE setting SET last_sync_at = current_timestamp WHERE id = 1')
    return { success: true, pushed: 0, pulled: (clients.data?.length || 0) + (invoices.data?.length || 0) + (expenses.data?.length || 0) + (settings.data?.length || 0) }
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

function formatSupabaseError(error: any, context: string): string {
  try {
    if (!error) return `${context}: Unknown error`
    const { message, details, hint, code, status } = error as any
    const parts = [context]
    if (code) parts.push(`code=${code}`)
    if (status) parts.push(`status=${status}`)
    if (message) parts.push(message)
    if (details) parts.push(details)
    if (hint) parts.push(hint)
    return parts.join(' • ')
  } catch {
    return `${context}: ${String(error)}`
  }
}

// Force Push: replace cloud DB with local DB (clients, invoices, expenses)
async function forcePush(): Promise<SyncResult> {
  try {
    // Ensure service role for destructive ops
    const role = await getSupabaseKeyRole()
    if (role !== 'service_role') {
      return { success: false, pushed: 0, pulled: 0, error: 'Force Push requires a Supabase service role key. Provide the service key in Settings.' }
    }

    const supabaseClientInstance = await initSupabaseClient()
    if (!supabaseClientInstance) {
      return { success: false, pushed: 0, pulled: 0, error: 'Supabase not configured or enabled' }
    }
    supabaseClient = supabaseClientInstance

    // Load local data (skip setting to avoid schema/RLS issues on cloud)
    const [clients, invoices, expenses] = await Promise.all([
      client.query('SELECT * FROM client'),
      client.query('SELECT * FROM invoice'),
      client.query('SELECT * FROM expense')
    ])

    // Delete remote in dependency order (children first)
    // automation_rule may not exist remotely; ignore if it fails
    try { await supabaseClient.from('automation_rule').delete().not('id', 'is', null) } catch {}

    const delExpense = await supabaseClient.from('expense').delete().not('id', 'is', null)
    if (delExpense.error) return { success: false, pushed: 0, pulled: 0, error: formatSupabaseError(delExpense.error, 'Delete expense (cloud)') }

    const delInvoice = await supabaseClient.from('invoice').delete().not('id', 'is', null)
    if (delInvoice.error) return { success: false, pushed: 0, pulled: 0, error: formatSupabaseError(delInvoice.error, 'Delete invoice (cloud)') }

    const delClient = await supabaseClient.from('client').delete().not('id', 'is', null)
    if (delClient.error) return { success: false, pushed: 0, pulled: 0, error: formatSupabaseError(delClient.error, 'Delete client (cloud)') }

    // Insert local into cloud
    if (clients.rows?.length) {
      const insClients = await supabaseClient.from('client').insert(clients.rows as any)
      if (insClients.error) return { success: false, pushed: 0, pulled: 0, error: formatSupabaseError(insClients.error, 'Insert clients (cloud)') }
    }
    if (invoices.rows?.length) {
      const insInvoices = await supabaseClient.from('invoice').insert(invoices.rows as any)
      if (insInvoices.error) return { success: false, pushed: 0, pulled: 0, error: formatSupabaseError(insInvoices.error, 'Insert invoices (cloud)') }
    }
    if (expenses.rows?.length) {
      const insExpenses = await supabaseClient.from('expense').insert(expenses.rows as any)
      if (insExpenses.error) return { success: false, pushed: 0, pulled: 0, error: formatSupabaseError(insExpenses.error, 'Insert expenses (cloud)') }
    }

    await client.query('UPDATE setting SET last_sync_at = current_timestamp WHERE id = 1')
    const pushed = (clients.rows?.length || 0) + (invoices.rows?.length || 0) + (expenses.rows?.length || 0)
    return { success: true, pushed, pulled: 0 }
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Real-time subscription management
async function setupRealtimeSubscriptions(): Promise<void> {
  if (!supabaseClient) return

  try {
    // Subscribe to client changes
    const clientSubscription = supabaseClient
      .channel('client-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'client' },
        async (payload) => {
          console.log('📡 Real-time client change received:', payload.eventType)
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newClient = payload.new
            await client.query(`
              INSERT INTO client (id, name, email, address, phone, hidden, tax_id, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                address = EXCLUDED.address,
                phone = EXCLUDED.phone,
                hidden = EXCLUDED.hidden,
                tax_id = EXCLUDED.tax_id,
                updated_at = EXCLUDED.updated_at
            `, [
              newClient.id, newClient.name, newClient.email,
              newClient.address, newClient.phone, newClient.hidden,
              newClient.tax_id, newClient.created_at, newClient.updated_at
            ])
          } else if (payload.eventType === 'DELETE') {
            await client.query('DELETE FROM client WHERE id = $1', [payload.old.id])
          }
        }
      )
      .subscribe()

    subscriptions.set('client', clientSubscription)

    // Subscribe to invoice changes
    const invoiceSubscription = supabaseClient
      .channel('invoice-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoice' },
        async (payload) => {
          console.log('📡 Real-time invoice change received:', payload.eventType)
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newInvoice = payload.new
            await client.query(`
              INSERT INTO invoice (id, number, client_id, issue_date, due_date, expected_payment_date, amount, currency, status, file_path, folder_path, description, notes, paid_at, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
              ON CONFLICT (id) DO UPDATE SET
                number = EXCLUDED.number,
                client_id = EXCLUDED.client_id,
                issue_date = EXCLUDED.issue_date,
                due_date = EXCLUDED.due_date,
                expected_payment_date = EXCLUDED.expected_payment_date,
                amount = EXCLUDED.amount,
                currency = EXCLUDED.currency,
                status = EXCLUDED.status,
                file_path = EXCLUDED.file_path,
                folder_path = EXCLUDED.folder_path,
                description = EXCLUDED.description,
                notes = EXCLUDED.notes,
                paid_at = EXCLUDED.paid_at,
                updated_at = EXCLUDED.updated_at
            `, [
              newInvoice.id, newInvoice.number, newInvoice.client_id,
              newInvoice.issue_date, newInvoice.due_date, newInvoice.expected_payment_date,
              newInvoice.amount, newInvoice.currency, newInvoice.status,
              newInvoice.file_path, newInvoice.folder_path, newInvoice.description,
              newInvoice.notes, newInvoice.paid_at, newInvoice.created_at,
              newInvoice.updated_at
            ])
          } else if (payload.eventType === 'DELETE') {
            await client.query('DELETE FROM invoice WHERE id = $1', [payload.old.id])
          }
        }
      )
      .subscribe()

    subscriptions.set('invoice', invoiceSubscription)

    // Subscribe to expense changes
    const expenseSubscription = supabaseClient
      .channel('expense-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'expense' },
        async (payload) => {
          console.log('📡 Real-time expense change received:', payload.eventType)
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newExpense = payload.new
            await client.query(`
              INSERT INTO expense (id, invoice_id, vendor, category, date, amount, currency, file_path, notes, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              ON CONFLICT (id) DO UPDATE SET
                invoice_id = EXCLUDED.invoice_id,
                vendor = EXCLUDED.vendor,
                category = EXCLUDED.category,
                date = EXCLUDED.date,
                amount = EXCLUDED.amount,
                currency = EXCLUDED.currency,
                file_path = EXCLUDED.file_path,
                notes = EXCLUDED.notes,
                updated_at = EXCLUDED.updated_at
            `, [
              newExpense.id, newExpense.invoice_id, newExpense.vendor,
              newExpense.category, newExpense.date, newExpense.amount,
              newExpense.currency, newExpense.file_path, newExpense.notes,
              newExpense.created_at, newExpense.updated_at
            ])
          } else if (payload.eventType === 'DELETE') {
            await client.query('DELETE FROM expense WHERE id = $1', [payload.old.id])
          }
        }
      )
      .subscribe()

    subscriptions.set('expense', expenseSubscription)

    console.log('✅ Real-time subscriptions established')
  } catch (error) {
    console.error('❌ Failed to setup real-time subscriptions:', error)
  }
}

// Cleanup subscriptions
function cleanupSubscriptions(): void {
  for (const [name, subscription] of subscriptions.entries()) {
    try {
      subscription.unsubscribe()
      console.log(`🔌 Unsubscribed from ${name} channel`)
    } catch (error) {
      console.error(`❌ Failed to unsubscribe from ${name}:`, error)
    }
  }
  subscriptions.clear()
}

// IPC Handlers
ipcMain.handle('sync:run', async () => {
  const r = await performSync()
  if (!r.success) {
    return { error: { code: 'SYNC_ERROR', message: r.error || 'Unknown sync error' } }
  }
  return { pushed: r.pushed, pulled: r.pulled, files: r.files }
})

ipcMain.handle('sync:getStatus', async (): Promise<SyncStatus> => {
  try {
    const result = await client.query(`
      SELECT supabase_url, supabase_key, supabase_sync_enabled, last_sync_at 
      FROM setting WHERE id = 1
    `)
    
    const row = result.rows[0] as any
    return {
      configured: !!(row?.supabase_url && row?.supabase_key),
      enabled: !!row?.supabase_sync_enabled,
      lastSyncAt: row?.last_sync_at
    }
  } catch (error) {
    return { configured: false, enabled: false }
  }
})


ipcMain.handle('sync:startRealtime', async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const client = await initSupabaseClient()
    if (!client) {
      return { success: false, error: 'Supabase not configured' }
    }

    supabaseClient = client
    await setupRealtimeSubscriptions()
    
    return { success: true }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
})

ipcMain.handle('sync:stopRealtime', async (): Promise<{ success: boolean }> => {
  try {
    cleanupSubscriptions()
    supabaseClient = null
    return { success: true }
  } catch (error) {
    return { success: false }
  }
})

// New explicit sync operations
ipcMain.handle('sync:mergePull', async () => {
  const r = await mergePull()
  if (!r.success) {
    return { error: { code: 'SYNC_ERROR', message: r.error || 'Unknown sync error' } }
  }
  return { pushed: r.pushed, pulled: r.pulled }
})

ipcMain.handle('sync:mergePush', async () => {
  const r = await mergePush()
  if (!r.success) {
    return { error: { code: 'SYNC_ERROR', message: r.error || 'Unknown sync error' } }
  }
  return { pushed: r.pushed, pulled: r.pulled }
})

ipcMain.handle('sync:forcePull', async () => {
  const r = await forcePull()
  if (!r.success) {
    return { error: { code: 'SYNC_ERROR', message: r.error || 'Unknown sync error' } }
  }
  return { pushed: r.pushed, pulled: r.pulled }
})

ipcMain.handle('sync:forcePush', async () => {
  const r = await forcePush()
  if (!r.success) {
    return { error: { code: 'SYNC_ERROR', message: r.error || 'Unknown sync error' } }
  }
  return { pushed: r.pushed, pulled: r.pulled }
})

// Cleanup on app exit
process.on('beforeExit', () => {
  cleanupSubscriptions()
})

export { performSync, setupRealtimeSubscriptions, cleanupSubscriptions }
