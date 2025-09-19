import { ipcMain, app } from 'electron'
import { promises as fs } from 'node:fs'
import { join, extname } from 'node:path'
import { z } from 'zod'
import { client, createAutoBackupIfPossible } from '@bills/db'
import { generateInvoicePdf } from '../pdf'
import { getDataRoot, getBillsFolder, ensureDirectoryExists } from './settings'
import { generateId } from './utils'

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
    
    // Create automatic backup after successful bill creation
    createAutoBackupIfPossible() // Don't await to avoid slowing down the UI response
    
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

// Extract fields from a bill file using AI
const ExtractedBillFieldsSchema = z.object({
  clientName: z.string().optional(),
  issueDate: z.string().optional(), // YYYY-MM-DD
  expectedPaymentDate: z.string().optional(), // YYYY-MM-DD
  amount: z.string().optional(), // keep as string with decimals
  currency: z.string().optional(),
  number: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional()
}).strict()

async function convertFileToBase64(filePath: string): Promise<{ base64: string; mimeType: string }> {
  try {
    const extension = extname(filePath).toLowerCase()
    const fileBuffer = await fs.readFile(filePath)
    const base64 = fileBuffer.toString('base64')
    
    // Determine MIME type based on extension
    let mimeType = 'application/octet-stream' // fallback
    switch (extension) {
      case '.pdf':
        mimeType = 'application/pdf'
        break
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg'
        break
      case '.png':
        mimeType = 'image/png'
        break
      case '.bmp':
        mimeType = 'image/bmp'
        break
      case '.tiff':
      case '.tif':
        mimeType = 'image/tiff'
        break
      case '.webp':
        mimeType = 'image/webp'
        break
    }
    
    return { base64, mimeType }
  } catch (error) {
    console.error('📄 File conversion failed:', error)
    throw new Error(`Failed to convert file to base64: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function analyzeBillDocumentWithOpenAI(filePath: string, apiKey: string): Promise<any> {
  try {
    // Convert file to base64 for OpenAI API
    const { base64, mimeType } = await convertFileToBase64(filePath)
    
    // Check file size (OpenAI has limits)
    const fileStats = await fs.stat(filePath)
    const fileSizeMB = fileStats.size / (1024 * 1024)
    
    if (fileSizeMB > 20) { // OpenAI limit is typically around 20MB
      throw new Error('File is too large (max 20MB). Please use a smaller file.')
    }
    
    // Set up OpenAI API key
    const prevKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = apiKey
    
    try {
      const { generateObject } = await import('ai')
      const { openai } = await import('@ai-sdk/openai')
      
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'), // Use GPT-4O for vision capabilities
        schema: ExtractedBillFieldsSchema as any,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a precise invoice/bill document analyzer. Analyze this document and extract structured information.

Instructions:
- Extract client/customer name (who the bill is for)
- Find the issue date (convert to YYYY-MM-DD format)
- Find the due date or payment date (convert to YYYY-MM-DD format)
- Identify the total amount (as decimal string like "123.45", without currency symbols)
- Determine the currency (EUR, USD, GBP, etc.)
- Extract the invoice/bill number
- Get service or product description
- Extract any relevant notes or additional observations

Return ONLY the fields you can confidently identify. If unsure about a field, omit it.

Required JSON keys (all optional): clientName, issueDate, expectedPaymentDate, amount, currency, number, description, notes`
              },
              {
                type: 'image',
                image: `data:${mimeType};base64,${base64}`
              }
            ]
          }
        ]
      })
      
      // Ensure output matches expected schema
      const fields = ExtractedBillFieldsSchema.parse(object)
      
      return { ok: true, fields }
      
    } finally {
      // Restore previous API key
      if (prevKey === undefined) {
        delete process.env.OPENAI_API_KEY
      } else {
        process.env.OPENAI_API_KEY = prevKey
      }
    }
    
  } catch (error) {
    throw error
  }
}

// Use the new unified AI system for bill field extraction
ipcMain.handle('bill:extractFields', async (_e, filePath: unknown) => {
  try {
    const validatedPath = z.string().min(1).parse(filePath)
    
    // Check if file exists
    try {
      await fs.access(validatedPath)
    } catch {
      return { error: { code: 'FILE_NOT_FOUND', message: 'The specified file could not be found' } }
    }
    
    console.log('🔄 Using unified AI system for bill analysis:', validatedPath)
    
    // Use the unified AI system (handles both OpenAI and Local AI based on settings)
    const { analyzeDocument } = await import('../ai')
    const result = await analyzeDocument(validatedPath, 'bill')
    
    console.log('✅ Unified AI analysis completed successfully')
    return { 
      fields: result.fields,
      confidence: result.confidence,
      textExtracted: result.text.length 
    }
    
  } catch (error) {
    console.error('❌ Extract bill fields error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Provide helpful error messages
    if (errorMessage.includes('Unsupported file format')) {
      return { error: { code: 'UNSUPPORTED_FILE_FORMAT', message: errorMessage } }
    } else if (errorMessage.includes('File not accessible')) {
      return { error: { code: 'FILE_NOT_FOUND', message: errorMessage } }
    } else {
      return { error: { code: 'EXTRACT_FIELDS_ERROR', message: errorMessage } }
    }
  }
})
