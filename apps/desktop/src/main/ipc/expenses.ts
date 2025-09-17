import { ipcMain, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { client } from '@bills/db'
import { getDataRoot, getExpensesFolder, ensureDirectoryExists } from './settings'

const addExpenseSchema = z.object({
  date: z.string(), // ISO date string
  amount: z.string(),
  vendor: z.string().min(1),
  category: z.string().min(1),
  invoiceId: z.string().optional(),
  notes: z.string().optional()
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

function generateId(): string {
  return createHash('md5').update(Date.now().toString() + Math.random().toString()).digest('hex').substring(0, 8)
}

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
    return { error: { code: 'GET_EXPENSE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
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
    return { ok: true }
  } catch (error) {
    return { error: { code: 'UPDATE_EXPENSE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
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
})

async function extractTextFromFile(filePath: string): Promise<string> {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.txt') {
    return await fs.readFile(filePath, 'utf8')
  }
  if (extension === '.pdf') {
    try {
      const { default: pdfParse } = await import('pdf-parse') as any
      const buffer = await fs.readFile(filePath)
      const data = await pdfParse(buffer)
      return String(data.text || '')
    } catch (error) {
      throw new Error('Failed to extract text from PDF')
    }
  }
  throw new Error('Unsupported file type for extraction')
}

ipcMain.handle('expense:extractFields', async (_e, expenseId: unknown) => {
  try {
    const validatedId = z.string().min(1).parse(expenseId)

    if (!process.env.OPENAI_API_KEY) {
      return { error: { code: 'OPENAI_API_KEY_MISSING', message: 'OpenAI API key is not configured' } }
    }

    // Load expense to get file path
    const res = await client.query('SELECT file_path FROM expense WHERE id = $1 LIMIT 1', [validatedId])
    const row = res.rows[0] as any
    if (!row || !row.file_path) {
      return { error: { code: 'NO_FILE_ATTACHED', message: 'No file attached to this expense' } }
    }

    const text = await extractTextFromFile(row.file_path as string)
    if (!text || text.trim().length === 0) {
      return { error: { code: 'NO_TEXT_EXTRACTED', message: 'Could not extract text from the attached file' } }
    }

    const { object } = await generateObject({
      model: openai('gpt-5-mini'),
      schema: ExtractedExpenseFieldsSchema,
      prompt: `You are a precise extraction assistant. From the following expense document text, extract fields to prefill an expense form.

Return ONLY the fields you can infer. If unknown, omit the field.

Required JSON keys (all optional): vendor, category, date (YYYY-MM-DD), amount (as a decimal string, like 123.45), notes.

Document text:\n\n${text.substring(0, 15000)}`
    })

    // Ensure output matches expected schema
    const fields = ExtractedExpenseFieldsSchema.parse(object)
    return { ok: true, fields }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { error: { code: 'EXTRACT_FIELDS_ERROR', message } }
  }
})
