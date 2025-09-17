import { ipcMain, app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { client } from '@bills/db'
import { generateInvoicePdf } from '../pdf'
import { getDataRoot, getBillsFolder, ensureDirectoryExists } from './settings'

// Input schemas for validation
const createBillSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1),
  issueDate: z.string(), // ISO date string
  expectedPaymentDate: z.string().optional(), // ISO date string
  amount: z.string(),
  currency: z.string().default('EUR'),
  number: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().optional(),
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('auto') }),
    z.object({ type: z.literal('file'), path: z.string().min(1) })
  ])
})

// Preview schema (auto-only for PDF generation)
const previewInvoiceSchema = z.object({
  clientName: z.string().min(1),
  issueDate: z.string(),
  expectedPaymentDate: z.string().optional(),
  amount: z.string(),
  currency: z.string().default('EUR'),
  number: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().optional()
})

const updateBillSchema = z.object({
  id: z.string().min(1),
  clientName: z.string().min(1),
  issueDate: z.string(),
  expectedPaymentDate: z.string().optional(),
  amount: z.string(),
  currency: z.string().default('EUR'),
  number: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().optional()
})

function generateId(): string {
  return createHash('md5').update(Date.now().toString() + Math.random().toString()).digest('hex').substring(0, 8)
}

// Generate a temporary PDF preview (auto format) and return a data URL
ipcMain.handle('bill:preview', async (_e, input) => {
  try {
    const data = previewInvoiceSchema.parse(input)
    const tempDir = await fs.mkdtemp(join(app.getPath('temp'), 'bill-preview-'))
    const pdfPath = join(tempDir, 'preview.pdf')

    // Load company profile if present
    let seller: any = null
    try {
      const settingsRes = await client.query('SELECT company_profile FROM setting WHERE id = 1')
      const profileText = (settingsRes.rows?.[0] as any)?.company_profile as string | undefined
      if (profileText) seller = JSON.parse(profileText)
    } catch {}

    await generateInvoicePdf({
      number: data.number,
      clientName: data.clientName,
      issueDate: data.issueDate,
      expectedPaymentDate: data.expectedPaymentDate,
      amount: data.amount,
      currency: data.currency,
      outputPath: pdfPath,
      seller,
      client: { name: data.clientName },
      items: [{ description: data.description || 'Serveis professionals', amount: data.amount }],
      description: data.description,
      notes: data.notes || null
    })

    const buf = await fs.readFile(pdfPath)
    const dataUrl = `data:application/pdf;base64,${Buffer.from(buf).toString('base64')}`
    return { dataUrl }
  } catch (error) {
    return { error: { code: 'PREVIEW_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
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
    const defaultExpected = new Date(issueDate)
    defaultExpected.setDate(defaultExpected.getDate() + 30)
    const expectedPaymentDate = data.expectedPaymentDate ? new Date(data.expectedPaymentDate) : defaultExpected
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
          expectedPaymentDate: expectedPaymentDate.toISOString().slice(0,10),
          amount: data.amount,
          currency: data.currency,
          outputPath: pdfPath,
          seller,
          client: {
            name: data.clientName
          },
          items: [
            { description: data.description || 'Serveis professionals', amount: data.amount }
          ],
          description: data.description,
          notes: data.notes || null
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
      `INSERT INTO invoice (id, number, client_id, issue_date, expected_payment_date, amount, currency, status, file_path, folder_path, description, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9, $10, $11, current_timestamp, current_timestamp)`,
      [invoiceId, data.number, clientId, data.issueDate, expectedPaymentDate.toISOString().slice(0,10), data.amount, data.currency, pdfPath, billFolder, data.description, data.notes || null]
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
        const { moveToTrash } = await import('./system')
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

ipcMain.handle('bill:get', async (_e, billId: string) => {
  try {
    const validatedId = z.string().min(1).parse(billId)
    
    const res = await client.query(
      `SELECT 
        i.id,
        i.number,
        i.client_id,
        i.issue_date,
        i.expected_payment_date,
        i.amount,
        i.currency,
               i.status,
               i.file_path,
               i.folder_path,
               i.description,
               i.notes,
               i.paid_at,
        i.created_at,
        i.updated_at,
        c.name as client_name,
        c.email as client_email
      FROM invoice i
      LEFT JOIN client c ON i.client_id = c.id
      WHERE i.id = $1
      LIMIT 1`,
      [validatedId]
    )
    const row = res.rows[0] as any
    if (!row) {
      return { error: { code: 'BILL_NOT_FOUND', message: 'Bill not found' } }
    }
    
    return {
      bill: {
        id: row.id,
        number: row.number,
        clientId: row.client_id,
        clientName: row.client_name,
        clientEmail: row.client_email,
        issueDate: row.issue_date,
        expectedPaymentDate: row.expected_payment_date,
        amount: row.amount,
        currency: row.currency,
               status: row.status,
               filePath: row.file_path,
               folderPath: row.folder_path,
               description: row.description,
               notes: row.notes,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }
  } catch (error) {
    return { error: { code: 'GET_BILL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('bill:update', async (_e, input) => {
  try {
    const data = updateBillSchema.parse(input)

    // Ensure client exists and get id
    let clientId: string
    const existing = await client.query('SELECT id FROM client WHERE name = $1 LIMIT 1', [data.clientName])
    if (existing.rows.length === 0) {
      clientId = generateId()
      await client.query(
        'INSERT INTO client (id, name, created_at, updated_at) VALUES ($1, $2, current_timestamp, current_timestamp)',
        [clientId, data.clientName]
      )
    } else {
      clientId = (existing.rows[0] as any).id
    }

    // Compute expected payment date if not provided (30 days after issue date)
    let expectedPaymentDate = data.expectedPaymentDate
    if (!expectedPaymentDate) {
      const issueDate = new Date(data.issueDate)
      const defaultExpected = new Date(issueDate)
      defaultExpected.setDate(defaultExpected.getDate() + 30)
      expectedPaymentDate = defaultExpected.toISOString().slice(0,10)
    }

    await client.query(
      `UPDATE invoice 
       SET number=$1, client_id=$2, issue_date=$3, expected_payment_date=$4, amount=$5, currency=$6, description=$7, notes=$8, updated_at=current_timestamp
       WHERE id=$9`,
      [data.number, clientId, data.issueDate, expectedPaymentDate, data.amount, data.currency, data.description, data.notes || null, data.id]
    )

    return { ok: true }
  } catch (error) {
    return { error: { code: 'UPDATE_BILL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
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
