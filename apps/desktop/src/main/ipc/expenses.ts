import { ipcMain, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { client, createAutoBackupIfPossible } from '@bills/db'
import { getDataRoot, getExpensesFolder, ensureDirectoryExists } from './settings'
import { generateId, createError } from './utils'

const addExpenseSchema = z.object({
  date: z.string(), // ISO date string
  amount: z.string(),
  vendor: z.string().min(1),
  category: z.string().min(1),
  invoiceId: z.string().optional(),
  notes: z.string().optional(),
  filePath: z.string().optional() // Temporary file path for copying
})

const updateExpenseSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  amount: z.string(),
  vendor: z.string().min(1),
  category: z.string().min(1),
  invoiceId: z.string().optional(),
  notes: z.string().optional()
})


ipcMain.handle('expense:add', async (_, input) => {
  try {
    const data = addExpenseSchema.parse(input)
    
    const expenseId = generateId()
    
    // Handle file copying if filePath is provided
    let finalFilePath = null
    if (data.filePath) {
      try {
        // Get data root and expenses folder
        const dataRoot = await getDataRoot()
        if (!dataRoot) {
          return { error: { code: 'NO_DATA_ROOT', message: 'Data root folder not configured' } }
        }
        
        const expensesRoot = await getExpensesFolder(dataRoot)
        await ensureDirectoryExists(expensesRoot)
        
        // Create filename: YYYY/MM/YYYY-MM-DD__expense-<id>__<vendor>.ext
        const expenseDate = new Date(data.date)
        const year = expenseDate.getFullYear()
        const month = String(expenseDate.getMonth() + 1).padStart(2, '0')
        const extension = extname(data.filePath)
        
        const fileName = `${year}-${month}-${String(expenseDate.getDate()).padStart(2, '0')}__expense-${expenseId}__${data.vendor.replace(/[^a-zA-Z0-9]/g, '_')}${extension}`
        const destFolder = join(expensesRoot, year.toString(), month)
        const destFile = join(destFolder, fileName)
        
        // Ensure directory exists
        await ensureDirectoryExists(destFolder)
        
        // Copy file
        await fs.copyFile(data.filePath, destFile)
        finalFilePath = destFile
      } catch (fileError) {
        console.error('Failed to copy file:', fileError)
        // Continue without file if copying fails
      }
    }
    
    await client.query(
      `INSERT INTO expense (id, invoice_id, vendor, category, date, amount, currency, notes, file_path, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'EUR', $7, $8, current_timestamp, current_timestamp)`,
      [expenseId, data.invoiceId || null, data.vendor, data.category, data.date, data.amount, data.notes || null, finalFilePath]
    )
    
    // Create automatic backup after successful expense creation
    createAutoBackupIfPossible() // Don't await to avoid slowing down the UI response
    
    return { ok: true, id: expenseId }
  } catch (error) {
    return createError('ADD_EXPENSE_ERROR', error)
  }
})

ipcMain.handle('expense:get', async (_e, expenseId: string) => {
  try {
    const validatedId = z.string().min(1).parse(expenseId)
    const res = await client.query(
      `SELECT 
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
      WHERE e.id = $1
      LIMIT 1`,
      [validatedId]
    )
    const row = res.rows[0] as any
    if (!row) return { error: { code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' } }
    return {
      expense: {
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
      }
    }
  } catch (error) {
    return createError('GET_EXPENSE_ERROR', error)
  }
})

ipcMain.handle('expense:update', async (_e, input) => {
  try {
    const data = updateExpenseSchema.parse(input)
    await client.query(
      `UPDATE expense 
       SET vendor=$1, category=$2, date=$3, amount=$4, notes=$5, invoice_id=$6, updated_at=current_timestamp
       WHERE id=$7`,
      [data.vendor, data.category, data.date, data.amount, data.notes || null, data.invoiceId || null, data.id]
    )
    
    // Create automatic backup after successful expense update
    createAutoBackupIfPossible() // Don't await to avoid slowing down the UI response
    
    return { ok: true }
  } catch (error) {
    return createError('UPDATE_EXPENSE_ERROR', error)
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
        { name: 'Documents & Images', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] },
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
    return createError('ATTACH_FILE_ERROR', error)
  }
})

// New handler for selecting file before creating expense
ipcMain.handle('expense:selectFile', async () => {
  try {
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
        { name: 'Documents & Images', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (result.canceled) {
      return { canceled: true }
    }
    
    const sourceFile = result.filePaths[0]
    
    return { ok: true, filePath: sourceFile }
  } catch (error) {
    return createError('SELECT_FILE_ERROR', error)
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
        const { moveToTrash } = await import('./system')
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

// Extract fields from an attached expense file using AI
const ExtractedExpenseFieldsSchema = z.object({
  vendor: z.string().optional(),
  category: z.string().optional(),
  date: z.string().optional(), // YYYY-MM-DD
  amount: z.string().optional(), // keep as string with decimals
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

async function analyzeDocumentWithOpenAI(filePath: string, apiKey: string): Promise<any> {
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
        schema: ExtractedExpenseFieldsSchema as any,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a precise expense document analyzer. Analyze this document and extract structured information.

Instructions:
- Extract vendor/company name (who you paid)
- Determine appropriate expense category from: Office Supplies, Travel, Software, Equipment, Marketing, Meals, Utilities, Other
- Find the transaction date (convert to YYYY-MM-DD format)
- Identify the total amount (as decimal string like "123.45", without currency symbols), ensure it is in EUR
- Extract any relevant notes or description

Return ONLY the fields you can confidently identify. If unsure about a field, omit it.

Required JSON keys (all optional): vendor, category, date, amount, notes`
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
      const fields = ExtractedExpenseFieldsSchema.parse(object)
      
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
    console.error('🤖 OpenAI vision analysis failed:', error)
    throw error
  }
}


// Use the new unified AI system for expense field extraction
ipcMain.handle('expense:extractFields', async (_e, expenseId: unknown) => {
  try {
    const validatedId = z.string().min(1).parse(expenseId)

    // Load expense to get file path
    console.log('📄 Loading expense file path...')
    const res = await client.query('SELECT file_path FROM expense WHERE id = $1 LIMIT 1', [validatedId])
    const row = res.rows[0] as any
    if (!row || !row.file_path) {
      return { error: { code: 'NO_FILE_ATTACHED', message: 'No file attached to this expense' } }
    }

    console.log('🔄 Using unified AI system for expense analysis:', row.file_path)
    
    // Use the unified AI system (handles both OpenAI and Local AI based on settings)
    const { analyzeDocument } = await import('../ai')
    const result = await analyzeDocument(row.file_path as string, 'expense')
    
    console.log('✅ Unified AI analysis completed successfully')
    return { 
      ok: true, 
      fields: result.fields,
      confidence: result.confidence,
      textExtracted: result.text.length 
    }
    
  } catch (error) {
    console.error('❌ Extract fields error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    
    // Provide helpful error messages
    if (message.includes('Unsupported file format')) {
      return { error: { code: 'UNSUPPORTED_FILE_FORMAT', message } }
    } else if (message.includes('File not accessible')) {
      return { error: { code: 'FILE_NOT_FOUND', message } }
    } else {
      return { error: { code: 'EXTRACT_FIELDS_ERROR', message } }
    }
  }
})


