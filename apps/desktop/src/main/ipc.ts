import { ipcMain, dialog, shell, app } from 'electron'
import { promises as fs } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { createHash, randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { z } from 'zod'
import { client } from '@bills/db'
import { generateInvoicePdf } from './pdf'

const scryptAsync = promisify(scrypt)

// Input schemas for validation
const createBillSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1),
  issueDate: z.string(), // ISO date string
  amount: z.string(),
  currency: z.string().default('EUR'),
  number: z.string().min(1),
  notes: z.string().optional(),
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('auto') }),
    z.object({ type: z.literal('file'), path: z.string().min(1) })
  ])
})

const addExpenseSchema = z.object({
  date: z.string(), // ISO date string
  amount: z.string(),
  vendor: z.string().min(1),
  category: z.string().min(1),
  invoiceId: z.string().optional(),
  notes: z.string().optional()
})

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  taxId: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal(''))
})

const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  taxId: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal(''))
})

const companyProfileSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  iban: z.string().optional(),
  swift: z.string().optional()
})

// Helper functions
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath)
  } catch {
    await fs.mkdir(dirPath, { recursive: true })
  }
}

async function moveToTrash(filePath: string): Promise<boolean> {
  try {
    await shell.trashItem(filePath)
    return true
  } catch (error) {
    console.error('Failed to move to trash:', error)
    return false
  }
}

function generateId(): string {
  return createHash('md5').update(Date.now().toString() + Math.random().toString()).digest('hex').substring(0, 8)
}

async function getDbPath(): Promise<string> {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    return process.env.DB_DIR || join(process.cwd(), 'pgdata')
  }
  return join(app.getPath('userData'), 'pgdata')
}

async function getConfigPath(): Promise<string> {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    return join(process.cwd(), 'bills-app.config.json')
  }
  return join(app.getPath('userData'), 'bills-app.config.json')
}

async function getDataRoot(): Promise<string | null> {
  try {
    const result = await client.query('SELECT data_root FROM setting WHERE id = 1')
    return (result.rows[0] as any)?.data_root || null
  } catch (error) {
    return null
  }
}

async function getBillsFolder(dataRoot: string): Promise<string> {
  return join(dataRoot, 'bills')
}

async function getExpensesFolder(dataRoot: string): Promise<string> {
  return join(dataRoot, 'expenses')
}

async function migrateDataToNewFolder(oldDataRoot: string | null, newDataRoot: string): Promise<void> {
  if (!oldDataRoot || oldDataRoot === newDataRoot) return

  console.log('🔄 Migrating data from', oldDataRoot, 'to', newDataRoot)
  
  const oldBillsFolder = join(oldDataRoot, 'bills')
  const oldExpensesFolder = join(oldDataRoot, 'expenses')
  const newBillsFolder = await getBillsFolder(newDataRoot)
  const newExpensesFolder = await getExpensesFolder(newDataRoot)

  // Ensure new directories exist
  await ensureDirectoryExists(newBillsFolder)
  await ensureDirectoryExists(newExpensesFolder)

  // Copy bills if old folder exists
  try {
    await fs.access(oldBillsFolder)
    const billFiles = await fs.readdir(oldBillsFolder, { recursive: true })
    for (const file of billFiles) {
      const oldPath = join(oldBillsFolder, file as string)
      const newPath = join(newBillsFolder, file as string)
      const stat = await fs.stat(oldPath)
      if (stat.isFile()) {
        await ensureDirectoryExists(dirname(newPath))
        await fs.copyFile(oldPath, newPath)
      }
    }
  } catch (error) {
    console.log('No bills folder to migrate or error:', error)
  }

  // Copy expenses if old folder exists
  try {
    await fs.access(oldExpensesFolder)
    const expenseFiles = await fs.readdir(oldExpensesFolder, { recursive: true })
    for (const file of expenseFiles) {
      const oldPath = join(oldExpensesFolder, file as string)
      const newPath = join(newExpensesFolder, file as string)
      const stat = await fs.stat(oldPath)
      if (stat.isFile()) {
        await ensureDirectoryExists(dirname(newPath))
        await fs.copyFile(oldPath, newPath)
      }
    }
  } catch (error) {
    console.log('No expenses folder to migrate or error:', error)
  }

  // Update file paths in database
  await client.query(`
    UPDATE invoice 
    SET 
      file_path = REPLACE(file_path, $1, $2),
      folder_path = REPLACE(folder_path, $1, $2),
      updated_at = current_timestamp
    WHERE file_path LIKE $1 || '%' OR folder_path LIKE $1 || '%'
  `, [oldDataRoot, newDataRoot])

  await client.query(`
    UPDATE expense 
    SET 
      file_path = REPLACE(file_path, $1, $2),
      updated_at = current_timestamp
    WHERE file_path LIKE $1 || '%'
  `, [oldDataRoot, newDataRoot])

  console.log('✅ Data migration completed')
}

async function saveConfigFile(dataRoot: string): Promise<void> {
  const configPath = await getConfigPath()
  const config = {
    version: '1.0.0',
    dataRoot,
    billsFolder: await getBillsFolder(dataRoot),
    expensesFolder: await getExpensesFolder(dataRoot),
    lastUpdated: new Date().toISOString()
  }
  
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('📄 Config file saved to:', configPath)
    
    // Also save a copy in the data root for backup
    const dataConfigPath = join(dataRoot, 'bills-app.config.json')
    await fs.writeFile(dataConfigPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('📄 Backup config file saved to:', dataConfigPath)
  } catch (error) {
    console.error('❌ Failed to save config file:', error)
    throw error
  }
}

// IPC Handlers

ipcMain.handle('settings:getDataRoot', async () => {
  try {
    const result = await client.query('SELECT data_root, bills_root, expenses_root FROM setting WHERE id = 1')
    const row = result.rows[0] as { data_root?: string; bills_root?: string; expenses_root?: string } | undefined
    
    // Migration: if we have old separate folders but no data_root, use bills_root as data_root
    if (!row?.data_root && row?.bills_root) {
      const dataRoot = dirname(row.bills_root) // Go up one level from bills folder
      await client.query('UPDATE setting SET data_root = $1 WHERE id = 1', [dataRoot])
      await saveConfigFile(dataRoot)
      return { path: dataRoot }
    }
    
    return { path: row?.data_root || null }
  } catch (error) {
    return { error: { code: 'DB_ERROR', message: 'Failed to get data root' } }
  }
})

ipcMain.handle('settings:getBillsRoot', async () => {
  try {
    const dataRoot = await getDataRoot()
    if (!dataRoot) {
      return { path: null }
    }
    return { path: await getBillsFolder(dataRoot) }
  } catch (error) {
    return { error: { code: 'DB_ERROR', message: 'Failed to get bills root' } }
  }
})

ipcMain.handle('settings:getExpensesRoot', async () => {
  try {
    const dataRoot = await getDataRoot()
    if (!dataRoot) {
      return { path: null }
    }
    return { path: await getExpensesFolder(dataRoot) }
  } catch (error) {
    return { error: { code: 'DB_ERROR', message: 'Failed to get expenses root' } }
  }
})

ipcMain.handle('folder:pickDataRoot', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Bills App Data Folder',
      properties: ['openDirectory', 'createDirectory'],
      message: 'Choose where to store your bills and expenses data'
    })
    
    if (result.canceled) {
      return { canceled: true }
    }
    
    return { canceled: false, path: result.filePaths[0] }
  } catch (error) {
    return { error: { code: 'DIALOG_ERROR', message: 'Failed to open folder picker' } }
  }
})

// Legacy handlers for backwards compatibility
ipcMain.handle('folder:pickBillsRoot', async () => {
  return ipcMain.emit('folder:pickDataRoot')
})

ipcMain.handle('folder:pickExpensesRoot', async () => {
  return ipcMain.emit('folder:pickDataRoot')
})

ipcMain.handle('folder:ensureDir', async (_, dirPath: string) => {
  try {
    const validatedPath = z.string().min(1).parse(dirPath)
    await ensureDirectoryExists(validatedPath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

// Generic file picker for PDFs (used by bills)
ipcMain.handle('file:pickPdf', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Invoice PDF',
      properties: ['openFile'],
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled) return { canceled: true }
    return { canceled: false, path: result.filePaths[0] }
  } catch (error) {
    return { error: { code: 'PICK_PDF_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('bill:create', async (_, input) => {
  try {
    const data = createBillSchema.parse(input)
    
    // Get data root and bills folder
    const dataRoot = await getDataRoot()
    if (!dataRoot) {
      return { error: { code: 'NO_DATA_ROOT', message: 'Data root folder not configured' } }
    }
    
    const billsRoot = await getBillsFolder(dataRoot)
    await ensureDirectoryExists(billsRoot)
    
    // Create folder structure: /YYYY/MM/YYYY-MM-DD__Client__INV-####/
    const issueDate = new Date(data.issueDate)
    const year = issueDate.getFullYear()
    const month = String(issueDate.getMonth() + 1).padStart(2, '0')
    const day = String(issueDate.getDate()).padStart(2, '0')
    
    const folderName = `${year}-${month}-${day}__${data.clientName.replace(/[^a-zA-Z0-9]/g, '_')}__${data.number}`
    const billFolder = join(billsRoot, year.toString(), month, folderName)
    
    // Ensure directories exist
    await ensureDirectoryExists(billFolder)
    
    // Ensure output path
    const pdfPath = join(billFolder, 'invoice.pdf')
    
    if (data.source.type === 'file') {
      try {
        await fs.copyFile(data.source.path, pdfPath)
      } catch (copyErr) {
        console.warn('Copying provided PDF failed, continuing:', copyErr)
        await fs.writeFile(pdfPath, 'PDF copy failed', 'utf-8')
      }
    } else {
      // Auto-generate using stored company profile (if any)
      try {
        const settingsRes = await client.query('SELECT company_profile FROM setting WHERE id = 1')
        const profileText = (settingsRes.rows?.[0] as any)?.company_profile as string | undefined
        let seller: any = null
        if (profileText) {
          try { seller = JSON.parse(profileText) } catch {}
        }
        await generateInvoicePdf({
          number: data.number,
          clientName: data.clientName,
          issueDate: data.issueDate,
          amount: data.amount,
          currency: data.currency,
          outputPath: pdfPath,
          seller
        })
      } catch (pdfError) {
        console.warn('PDF generation failed, continuing without PDF:', pdfError)
        await fs.writeFile(pdfPath, 'PDF generation failed', 'utf-8')
      }
    }
    
    // Create or find client
    let clientId: string
    if (data.clientId) {
      clientId = data.clientId
    } else {
      const clientResult = await client.query('SELECT id FROM client WHERE name = $1 LIMIT 1', [data.clientName])
      if (clientResult.rows.length === 0) {
        clientId = generateId()
        await client.query(
          'INSERT INTO client (id, name, created_at, updated_at) VALUES ($1, $2, current_timestamp, current_timestamp)',
          [clientId, data.clientName]
        )
      } else {
        const client = clientResult.rows[0] as { id: string }
        clientId = client.id
      }
    }
    
    // Insert invoice record
    const invoiceId = generateId()
    await client.query(
      `INSERT INTO invoice (id, number, client_id, issue_date, amount, currency, status, file_path, folder_path, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, $9, current_timestamp, current_timestamp)`,
      [invoiceId, data.number, clientId, data.issueDate, data.amount, data.currency, pdfPath, billFolder, data.notes || null]
    )
    
    return { ok: true, id: invoiceId, folderPath: billFolder, filePath: pdfPath }
  } catch (error) {
    console.error('Failed to create bill:', error)
    return { error: { code: 'CREATE_BILL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('bill:delete', async (_, billId: string) => {
  try {
    const validatedId = z.string().min(1).parse(billId)
    
    // Get bill info
    const result = await client.query('SELECT folder_path FROM invoice WHERE id = $1', [validatedId])
    const bill = result.rows[0] as any
    
    if (!bill) {
      return { error: { code: 'BILL_NOT_FOUND', message: 'Bill not found' } }
    }
    
    // Move folder to trash if it exists
    if (bill.folder_path) {
      try {
        await fs.access(bill.folder_path)
        const trashed = await moveToTrash(bill.folder_path)
        if (!trashed) {
          console.warn('Failed to move folder to trash:', bill.folder_path)
        }
      } catch {
        // Folder doesn't exist, continue with DB deletion
      }
    }
    
    // Delete from database
    await client.query('DELETE FROM invoice WHERE id = $1', [validatedId])
    
    return { ok: true }
  } catch (error) {
    return { error: { code: 'DELETE_BILL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('expense:add', async (_, input) => {
  try {
    const data = addExpenseSchema.parse(input)
    
    const expenseId = generateId()
    await client.query(
      `INSERT INTO expense (id, invoice_id, vendor, category, date, amount, currency, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'EUR', $7, current_timestamp, current_timestamp)`,
      [expenseId, data.invoiceId || null, data.vendor, data.category, data.date, data.amount, data.notes || null]
    )
    
    return { ok: true, id: expenseId }
  } catch (error) {
    return { error: { code: 'ADD_EXPENSE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('expense:attachFile', async (_, expenseId: string) => {
  try {
    const validatedId = z.string().min(1).parse(expenseId)
    
    // Get data root and expenses folder
    const dataRoot = await getDataRoot()
    if (!dataRoot) {
      return { error: { code: 'NO_DATA_ROOT', message: 'Data root folder not configured' } }
    }
    
    const expensesRoot = await getExpensesFolder(dataRoot)
    await ensureDirectoryExists(expensesRoot)
    
    // Show file picker
    const result = await dialog.showOpenDialog({
      title: 'Select Document to Attach',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (result.canceled) {
      return { canceled: true }
    }
    
    const sourceFile = result.filePaths[0]
    const extension = extname(sourceFile)
    
    // Get expense info
    const expenseResult = await client.query('SELECT vendor, date FROM expense WHERE id = $1', [validatedId])
    const expense = expenseResult.rows[0] as any
    
    if (!expense) {
      return { error: { code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' } }
    }
    
    // Create filename: YYYY/MM/YYYY-MM-DD__expense-<id>__<vendor>.ext
    const expenseDate = new Date(expense.date)
    const year = expenseDate.getFullYear()
    const month = String(expenseDate.getMonth() + 1).padStart(2, '0')
    const day = String(expenseDate.getDate()).padStart(2, '0')
    
    const fileName = `${year}-${month}-${day}__expense-${validatedId}__${expense.vendor.replace(/[^a-zA-Z0-9]/g, '_')}${extension}`
    const destFolder = join(expensesRoot, year.toString(), month)
    const destFile = join(destFolder, fileName)
    
    // Ensure directory exists
    await ensureDirectoryExists(destFolder)
    
    // Copy file
    await fs.copyFile(sourceFile, destFile)
    
    // Update expense record
    await client.query('UPDATE expense SET file_path = $1, updated_at = current_timestamp WHERE id = $2', [destFile, validatedId])
    
    return { ok: true, filePath: destFile }
  } catch (error) {
    return { error: { code: 'ATTACH_FILE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('expense:delete', async (_, expenseId: string) => {
  try {
    const validatedId = z.string().min(1).parse(expenseId)
    
    // Get expense info
    const result = await client.query('SELECT file_path FROM expense WHERE id = $1', [validatedId])
    const expense = result.rows[0]
    
    if (!expense) {
      return { error: { code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' } }
    }
    
    // Move file to trash if it exists
    if ((expense as any).file_path) {
      try {
        await fs.access((expense as any).file_path)
        const trashed = await moveToTrash((expense as any).file_path)
        if (!trashed) {
          console.warn('Failed to move file to trash:', (expense as any).file_path)
        }
      } catch {
        // File doesn't exist, continue with DB deletion
      }
    }
    
    // Delete from database
    await client.query('DELETE FROM expense WHERE id = $1', [validatedId])
    
    return { ok: true }
  } catch (error) {
    return { error: { code: 'DELETE_EXPENSE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('app:getStatus', async () => {
  try {
    console.log('📡 IPC: app:getStatus called')
    const result = await client.query('SELECT data_root, bills_root, expenses_root, security FROM setting WHERE id = 1')
    console.log('📊 Query result:', result.rows)
    const row = result.rows[0] as { data_root?: string; bills_root?: string; expenses_root?: string; security?: string } | undefined
    
    // Check if we have configuration - prefer data_root, fallback to legacy
    const hasSettings = !!(row?.data_root || (row?.bills_root && row?.expenses_root))
    let hasPassword = false
    
    console.log('🔍 Configuration check:')
    console.log('  - data_root:', row?.data_root)
    console.log('  - bills_root:', row?.bills_root)
    console.log('  - expenses_root:', row?.expenses_root)
    console.log('  - hasSettings:', hasSettings)
    
    if (row?.security) {
      try {
        const security = JSON.parse(row.security)
        hasPassword = security.hasPassword === true
        console.log('  - security config found, hasPassword:', hasPassword)
      } catch (error) {
        console.log('  - security config invalid:', error)
        // Invalid JSON, treat as no password
      }
    } else {
      console.log('  - no security config found')
    }
    
    const status = { hasSettings, hasPassword, dataRoot: row?.data_root }
    console.log('✅ Returning status:', status)
    return status
  } catch (error) {
    console.error('❌ Error in getStatus:', error)
    return { error: { code: 'GET_STATUS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('auth:setPassword', async (_, plainPassword: string | null) => {
  try {
    let securityData = null
    
    if (plainPassword) {
      const salt = randomBytes(16).toString('hex')
      const hash = await scryptAsync(plainPassword, salt, 32)
      
      securityData = JSON.stringify({
        hasPassword: true,
        salt,
        hash: (hash as Buffer).toString('hex')
      })
    }
    
    // Upsert setting row
    await client.query(`
      INSERT INTO setting (id, security, created_at, updated_at) 
      VALUES (1, $1, current_timestamp, current_timestamp)
      ON CONFLICT (id) DO UPDATE SET 
        security = $1, 
        updated_at = current_timestamp
    `, [securityData])
    
    return { ok: true }
  } catch (error) {
    return { error: { code: 'SET_PASSWORD_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('auth:changePassword', async (_, currentPassword: string, newPassword: string | null) => {
  try {
    // First verify current password
    const verifyResult = await client.query('SELECT security FROM setting WHERE id = 1')
    const settings = verifyResult.rows[0] as any
    
    if (!settings?.security) {
      return { error: { code: 'NO_PASSWORD_SET', message: 'No password currently set' } }
    }
    
    const security = JSON.parse(settings.security)
    if (!security.hasPassword || !security.salt || !security.hash) {
      return { error: { code: 'INVALID_SECURITY', message: 'Invalid security configuration' } }
    }
    
    // Verify current password
    const hash = await scryptAsync(currentPassword, security.salt, 32)
    const isValid = (hash as Buffer).toString('hex') === security.hash
    
    if (!isValid) {
      return { error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' } }
    }
    
    // Set new password (or remove if null)
    let newSecurityData = null
    if (newPassword) {
      const newSalt = randomBytes(16).toString('hex')
      const newHash = await scryptAsync(newPassword, newSalt, 32)
      
      newSecurityData = JSON.stringify({
        hasPassword: true,
        salt: newSalt,
        hash: (newHash as Buffer).toString('hex')
      })
    }
    
    await client.query(`
      UPDATE setting SET security = $1, updated_at = current_timestamp WHERE id = 1
    `, [newSecurityData])
    
    return { ok: true }
  } catch (error) {
    return { error: { code: 'CHANGE_PASSWORD_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('auth:verifyPassword', async (_, plainPassword: string) => {
  try {
    const result = await client.query('SELECT security FROM setting WHERE id = 1')
    const row = result.rows[0] as { security?: string } | undefined
    
    if (!row?.security) {
      return { valid: false }
    }
    
    const security = JSON.parse(row.security)
    if (!security.hasPassword || !security.salt || !security.hash) {
      return { valid: false }
    }
    
    const hash = await scryptAsync(plainPassword, security.salt, 32)
    const isValid = (hash as Buffer).toString('hex') === security.hash
    
    return { valid: isValid }
  } catch (error) {
    return { error: { code: 'VERIFY_PASSWORD_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('settings:save', async (_, data: { dataRoot?: string; billsRoot?: string; expensesRoot?: string }) => {
  try {
    console.log('💾 IPC: settings:save called with data:', data)
    
    const oldDataRoot = await getDataRoot()
    console.log('🔍 Current data root:', oldDataRoot)
    
    const newDataRoot = data.dataRoot || null
    
    // If we have a new data root, migrate data
    if (newDataRoot && oldDataRoot !== newDataRoot) {
      console.log('🔄 Migrating data from', oldDataRoot, 'to', newDataRoot)
      await migrateDataToNewFolder(oldDataRoot, newDataRoot)
    }
    
    // For new single-folder approach
    if (data.dataRoot) {
      console.log('📁 Setting up single folder approach for:', data.dataRoot)
      const billsFolder = await getBillsFolder(data.dataRoot)
      const expensesFolder = await getExpensesFolder(data.dataRoot)
      
      console.log('📁 Bills folder:', billsFolder)
      console.log('📁 Expenses folder:', expensesFolder)
      
      // Ensure subfolders exist
      await ensureDirectoryExists(billsFolder)
      await ensureDirectoryExists(expensesFolder)
      
      console.log('💾 Saving to database...')
      await client.query(`
        INSERT INTO setting (id, data_root, bills_root, expenses_root, created_at, updated_at)
        VALUES (1, $1, $2, $3, current_timestamp, current_timestamp)
        ON CONFLICT (id) DO UPDATE SET 
          data_root = $1,
          bills_root = $2,
          expenses_root = $3,
          updated_at = current_timestamp
      `, [data.dataRoot, billsFolder, expensesFolder])
      
      console.log('📄 Saving config file...')
      // Save config file
      await saveConfigFile(data.dataRoot)
      console.log('✅ Configuration saved successfully!')
    } else {
      console.log('📁 Using legacy separate folders approach')
      // Legacy: separate folders (backwards compatibility)
      const billsRoot = data.billsRoot || null
      const expensesRoot = data.expensesRoot || null
      
      await client.query(`
        INSERT INTO setting (id, bills_root, expenses_root, created_at, updated_at)
        VALUES (1, $1, $2, current_timestamp, current_timestamp)
        ON CONFLICT (id) DO UPDATE SET 
          bills_root = COALESCE($1, setting.bills_root),
          expenses_root = COALESCE($2, setting.expenses_root),
          updated_at = current_timestamp
      `, [billsRoot, expensesRoot])
    }
    
    return { ok: true }
  } catch (error) {
    console.error('❌ Failed to save settings:', error)
    return { error: { code: 'SAVE_SETTINGS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('settings:reconfigure', async (_, newDataRoot: string) => {
  try {
    const oldDataRoot = await getDataRoot()
    
    // Migrate data if needed
    if (oldDataRoot && oldDataRoot !== newDataRoot) {
      await migrateDataToNewFolder(oldDataRoot, newDataRoot)
    }
    
    const billsFolder = await getBillsFolder(newDataRoot)
    const expensesFolder = await getExpensesFolder(newDataRoot)
    
    // Ensure new subfolders exist
    await ensureDirectoryExists(billsFolder)
    await ensureDirectoryExists(expensesFolder)
    
    // Update settings
    await client.query(`
      INSERT INTO setting (id, data_root, bills_root, expenses_root, created_at, updated_at)
      VALUES (1, $1, $2, $3, current_timestamp, current_timestamp)
      ON CONFLICT (id) DO UPDATE SET 
        data_root = $1,
        bills_root = $2,
        expenses_root = $3,
        updated_at = current_timestamp
    `, [newDataRoot, billsFolder, expensesFolder])
    
    // Save config file
    await saveConfigFile(newDataRoot)
    
    return { ok: true, billsFolder, expensesFolder }
  } catch (error) {
    return { error: { code: 'RECONFIGURE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('bill:updateStatus', async (_, billId: string, status: string) => {
  try {
    const validatedId = z.string().min(1).parse(billId)
    const validatedStatus = z.enum(['DRAFT', 'SENT', 'PAID', 'CANCELLED']).parse(status)
    
    const paidAt = validatedStatus === 'PAID' ? new Date().toISOString() : null
    
    await client.query(
      'UPDATE invoice SET status = $1, paid_at = $2, updated_at = current_timestamp WHERE id = $3',
      [validatedStatus, paidAt, validatedId]
    )
    
    return { ok: true }
  } catch (error) {
    return { error: { code: 'UPDATE_STATUS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('system:openPath', async (_, path: string) => {
  try {
    const validatedPath = z.string().min(1).parse(path)
    await shell.showItemInFolder(validatedPath)
    return { ok: true }
  } catch (error) {
    return { error: { code: 'OPEN_PATH_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Test handler to verify config file creation
ipcMain.handle('debug:checkConfigFile', async () => {
  try {
    const configPath = await getConfigPath()
    const dataRoot = await getDataRoot()
    
    let mainConfigExists = false
    let dataConfigExists = false
    let mainConfigContent = null
    let dataConfigContent = null
    
    try {
      await fs.access(configPath)
      mainConfigExists = true
      const content = await fs.readFile(configPath, 'utf-8')
      mainConfigContent = JSON.parse(content)
    } catch (error) {
      console.log('Main config file not found:', configPath)
    }
    
    if (dataRoot) {
      try {
        const dataConfigPath = join(dataRoot, 'bills-app.config.json')
        await fs.access(dataConfigPath)
        dataConfigExists = true
        const content = await fs.readFile(dataConfigPath, 'utf-8')
        dataConfigContent = JSON.parse(content)
      } catch (error) {
        console.log('Data config file not found in:', dataRoot)
      }
    }
    
    return {
      mainConfig: { exists: mainConfigExists, path: configPath, content: mainConfigContent },
      dataConfig: { exists: dataConfigExists, path: dataRoot ? join(dataRoot, 'bills-app.config.json') : null, content: dataConfigContent },
      dataRoot
    }
  } catch (error) {
    return { error: { code: 'CHECK_CONFIG_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Add IPC handlers for getting bills and expenses data
ipcMain.handle('data:getBills', async (_, filters?: { status?: string }) => {
  try {
    let query = `
      SELECT 
        i.id,
        i.number,
        i.issue_date,
        i.due_date,
        i.amount,
        i.currency,
        i.status,
        i.file_path,
        i.folder_path,
        i.notes,
        i.paid_at,
        i.created_at,
        i.updated_at,
        c.name as client_name,
        c.email as client_email
      FROM invoice i
      LEFT JOIN client c ON i.client_id = c.id
    `
    
    const params: any[] = []
    
    if (filters?.status) {
      query += ` WHERE i.status = $1`
      params.push(filters.status)
    }
    
    query += ` ORDER BY i.created_at DESC`
    
    const result = await client.query(query, params)
    
    return {
      bills: result.rows.map((row: any) => ({
        id: row.id,
        number: row.number,
        clientName: row.client_name,
        clientEmail: row.client_email,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        filePath: row.file_path,
        folderPath: row.folder_path,
        notes: row.notes,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  } catch (error) {
    return { error: { code: 'GET_BILLS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('data:getExpenses', async (_, filters?: { startDate?: string; endDate?: string }) => {
  try {
    let query = `
      SELECT 
        e.id,
        e.vendor,
        e.category,
        e.date,
        e.amount,
        e.currency,
        e.file_path,
        e.notes,
        e.created_at,
        e.updated_at,
        i.number as invoice_number,
        i.id as invoice_id
      FROM expense e
      LEFT JOIN invoice i ON e.invoice_id = i.id
    `
    
    const params: any[] = []
    const conditions: string[] = []
    
    if (filters?.startDate) {
      conditions.push(`e.date >= $${params.length + 1}`)
      params.push(filters.startDate)
    }
    
    if (filters?.endDate) {
      conditions.push(`e.date <= $${params.length + 1}`)
      params.push(filters.endDate)
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }
    
    query += ` ORDER BY e.date DESC`
    
    const result = await client.query(query, params)
    
    return {
      expenses: result.rows.map((row: any) => ({
        id: row.id,
        vendor: row.vendor,
        category: row.category,
        date: row.date,
        amount: row.amount,
        currency: row.currency,
        filePath: row.file_path,
        notes: row.notes,
        invoiceNumber: row.invoice_number,
        invoiceId: row.invoice_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  } catch (error) {
    return { error: { code: 'GET_EXPENSES_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('data:getStats', async () => {
  try {
    // Get current date info
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear
    
    // Calculate 12 months ago
    const firstOfCurrentMonth = new Date(currentYear, currentMonth - 1, 1)
    const twelveMonthsStart = new Date(firstOfCurrentMonth)
    twelveMonthsStart.setMonth(twelveMonthsStart.getMonth() - 11)
    const twelveMonthsStartStr = twelveMonthsStart.toISOString().slice(0, 10)
    
    // Total paid income
    const totalIncomeResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM invoice 
      WHERE status = 'PAID' OR paid_at IS NOT NULL
    `)
    const totalIncome = (totalIncomeResult.rows[0] as any)?.total || '0'
    
    // Total expenses
    const totalExpensesResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM expense
    `)
    const totalExpenses = (totalExpensesResult.rows[0] as any)?.total || '0'
    
    // Last month income
    const lastMonthIncomeResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM invoice 
      WHERE (status = 'PAID' OR paid_at IS NOT NULL)
        AND EXTRACT(YEAR FROM issue_date) = $1
        AND EXTRACT(MONTH FROM issue_date) = $2
    `, [lastMonthYear, lastMonth])
    const lastMonthIncome = (lastMonthIncomeResult.rows[0] as any)?.total || '0'
    
    // Last month expenses
    const lastMonthExpensesResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM expense 
      WHERE EXTRACT(YEAR FROM date) = $1
        AND EXTRACT(MONTH FROM date) = $2
    `, [lastMonthYear, lastMonth])
    const lastMonthExpenses = (lastMonthExpensesResult.rows[0] as any)?.total || '0'
    
    // Calculate net income
    const netIncome = (parseFloat(totalIncome) - parseFloat(totalExpenses)).toString()

    // Monthly aggregation for last 12 months (including current month)
    const incomeByMonthRes = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM issue_date) AS year,
        EXTRACT(MONTH FROM issue_date) AS month,
        COALESCE(SUM(amount), 0) AS total
      FROM invoice
      WHERE (status = 'PAID' OR paid_at IS NOT NULL)
        AND issue_date >= $1
      GROUP BY 1,2
      ORDER BY 1,2
    `, [twelveMonthsStartStr])

    const expensesByMonthRes = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM date) AS year,
        EXTRACT(MONTH FROM date) AS month,
        COALESCE(SUM(amount), 0) AS total
      FROM expense
      WHERE date >= $1
      GROUP BY 1,2
      ORDER BY 1,2
    `, [twelveMonthsStartStr])

    const incomeMap = new Map<string, string>()
    for (const row of incomeByMonthRes.rows as any[]) {
      const y = Math.trunc(row.year)
      const m = Math.trunc(row.month)
      const key = `${y}-${String(m).padStart(2, '0')}`
      incomeMap.set(key, (row.total ?? '0').toString())
    }

    const expensesMap = new Map<string, string>()
    for (const row of (expensesByMonthRes.rows as any[])) {
      const y = Math.trunc(row.year)
      const m = Math.trunc(row.month)
      const key = `${y}-${String(m).padStart(2, '0')}`
      expensesMap.set(key, (row.total ?? '0').toString())
    }

    const monthlyData: Array<{ year: number; month: number; income: string; expenses: string }> = []
    const iter = new Date(twelveMonthsStart)
    for (let i = 0; i < 12; i++) {
      const y = iter.getFullYear()
      const m = iter.getMonth() + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      monthlyData.push({
        year: y,
        month: m,
        income: incomeMap.get(key) || '0',
        expenses: expensesMap.get(key) || '0'
      })
      iter.setMonth(iter.getMonth() + 1)
    }
    
    return {
      totals: { income: totalIncome, expenses: totalExpenses, net: netIncome },
      lastMonth: { income: lastMonthIncome, expenses: lastMonthExpenses },
      monthlyData
    }
  } catch (error) {
    return { error: { code: 'GET_STATS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Clients CRUD (minimal)
ipcMain.handle('data:getClients', async () => {
  try {
    const result = await client.query('SELECT id, name, email, tax_id, address, phone, created_at, updated_at FROM client ORDER BY name ASC')
    return {
      clients: result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        taxId: row.tax_id,
        address: row.address,
        phone: row.phone,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  } catch (error) {
    return { error: { code: 'GET_CLIENTS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('client:create', async (_e, input) => {
  try {
    const data = createClientSchema.parse(input)
    const id = generateId()
    await client.query(
      'INSERT INTO client (id, name, email, tax_id, address, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, current_timestamp, current_timestamp)',
      [id, data.name, data.email || null, data.taxId || null, data.address || null, data.phone || null]
    )
    return { ok: true, id }
  } catch (error) {
    return { error: { code: 'CREATE_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Company profile (my data)
ipcMain.handle('settings:getCompanyProfile', async () => {
  try {
    const result = await client.query('SELECT company_profile FROM setting WHERE id = 1')
    const text = (result.rows?.[0] as any)?.company_profile as string | undefined
    return { profile: text ? JSON.parse(text) : null }
  } catch (error) {
    return { error: { code: 'GET_COMPANY_PROFILE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Client read/update
ipcMain.handle('client:get', async (_e, id: string) => {
  try {
    const validated = z.string().min(1).parse(id)
    const res = await client.query('SELECT id, name, email, tax_id, address, phone, created_at, updated_at FROM client WHERE id = $1', [validated])
    const row = res.rows[0] as any
    if (!row) return { error: { code: 'CLIENT_NOT_FOUND', message: 'Client not found' } }
    return { client: {
      id: row.id,
      name: row.name,
      email: row.email,
      taxId: row.tax_id,
      address: row.address,
      phone: row.phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }}
  } catch (error) {
    return { error: { code: 'GET_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('client:update', async (_e, input) => {
  try {
    const data = updateClientSchema.parse(input)
    await client.query(
      `UPDATE client SET name=$1, email=$2, tax_id=$3, address=$4, phone=$5, updated_at=current_timestamp WHERE id=$6`,
      [data.name, data.email || null, data.taxId || null, data.address || null, data.phone || null, data.id]
    )
    return { ok: true }
  } catch (error) {
    return { error: { code: 'UPDATE_CLIENT_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('settings:saveCompanyProfile', async (_e, profile: unknown) => {
  try {
    // Validate
    const parsed = companyProfileSchema.parse(profile)
    const text = JSON.stringify(parsed)
    await client.query(`
      INSERT INTO setting (id, company_profile, created_at, updated_at)
      VALUES (1, $1, current_timestamp, current_timestamp)
      ON CONFLICT (id) DO UPDATE SET
        company_profile = $1,
        updated_at = current_timestamp
    `, [text])
    return { ok: true }
  } catch (error) {
    return { error: { code: 'SAVE_COMPANY_PROFILE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})
