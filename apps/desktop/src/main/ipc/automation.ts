import { ipcMain } from 'electron'
import { z } from 'zod'
import { client } from '@bills/db'
import { generateId } from './utils'

const automationRuleSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  dayOfMonth: z.number().min(1).max(31),
  amount: z.string().min(1),
  currency: z.string().default('EUR'),
  description: z.string().min(1),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
  ccEmails: z.array(z.string().email()).optional(),
  isActive: z.boolean().default(true)
})

const updateAutomationRuleSchema = automationRuleSchema.extend({
  id: z.string().min(1)
})


// Get all automation rules
ipcMain.handle('automation:getRules', async () => {
  try {
    const result = await client.query(`
      SELECT 
        ar.id,
        ar.client_id,
        ar.name,
        ar.day_of_month,
        ar.amount,
        ar.currency,
        ar.description,
        ar.subject_template,
        ar.body_template,
        ar.cc_emails,
        ar.is_active,
        ar.last_sent_date,
        ar.next_due_date,
        ar.created_at,
        ar.updated_at,
        c.name as client_name,
        c.email as client_email
      FROM automation_rule ar
      LEFT JOIN client c ON ar.client_id = c.id
      ORDER BY ar.created_at DESC
    `)
    
    return {
      rules: result.rows.map((row: any) => {
        let ccEmails: string[] | undefined
        try {
          ccEmails = row.cc_emails ? JSON.parse(row.cc_emails) : undefined
        } catch {
          ccEmails = undefined
        }
        
        return {
          id: row.id,
          clientId: row.client_id,
          clientName: row.client_name,
          clientEmail: row.client_email,
          name: row.name,
          dayOfMonth: row.day_of_month,
          amount: row.amount,
          currency: row.currency,
          description: row.description,
          subjectTemplate: row.subject_template,
          bodyTemplate: row.body_template,
          ccEmails,
          isActive: row.is_active,
          lastSentDate: row.last_sent_date,
          nextDueDate: row.next_due_date,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      })
    }
  } catch (error) {
    return { error: { code: 'GET_AUTOMATION_RULES_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Create automation rule
ipcMain.handle('automation:createRule', async (_, data: unknown) => {
  try {
    const parsed = automationRuleSchema.parse(data)
    const id = generateId()
    
    // Calculate next due date
    const now = new Date()
    const nextDue = new Date(now.getFullYear(), now.getMonth(), parsed.dayOfMonth)
    if (nextDue <= now) {
      nextDue.setMonth(nextDue.getMonth() + 1)
    }
    
    const ccEmailsJson = parsed.ccEmails ? JSON.stringify(parsed.ccEmails) : null
    
    await client.query(`
      INSERT INTO automation_rule (
        id, client_id, name, day_of_month, amount, currency, 
        description, subject_template, body_template, cc_emails, is_active, 
        next_due_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
    `, [
      id,
      parsed.clientId,
      parsed.name,
      parsed.dayOfMonth,
      parsed.amount,
      parsed.currency,
      parsed.description,
      parsed.subjectTemplate,
      parsed.bodyTemplate,
      ccEmailsJson,
      parsed.isActive,
      nextDue.toISOString().split('T')[0],
      new Date().toISOString()
    ])
    
    return { id }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: { code: 'VALIDATION_ERROR', message: 'Invalid automation rule data' } }
    }
    return { error: { code: 'CREATE_AUTOMATION_RULE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Update automation rule
ipcMain.handle('automation:updateRule', async (_, data: unknown) => {
  try {
    const parsed = updateAutomationRuleSchema.parse(data)
    
    // Calculate next due date if day of month changed
    const now = new Date()
    const nextDue = new Date(now.getFullYear(), now.getMonth(), parsed.dayOfMonth)
    if (nextDue <= now) {
      nextDue.setMonth(nextDue.getMonth() + 1)
    }
    
    const ccEmailsJson = parsed.ccEmails ? JSON.stringify(parsed.ccEmails) : null
    
    await client.query(`
      UPDATE automation_rule 
      SET 
        client_id = $2,
        name = $3,
        day_of_month = $4,
        amount = $5,
        currency = $6,
        description = $7,
        subject_template = $8,
        body_template = $9,
        cc_emails = $10,
        is_active = $11,
        next_due_date = $12,
        updated_at = $13
      WHERE id = $1
    `, [
      parsed.id,
      parsed.clientId,
      parsed.name,
      parsed.dayOfMonth,
      parsed.amount,
      parsed.currency,
      parsed.description,
      parsed.subjectTemplate,
      parsed.bodyTemplate,
      ccEmailsJson,
      parsed.isActive,
      nextDue.toISOString().split('T')[0],
      new Date().toISOString()
    ])
    
    return { success: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: { code: 'VALIDATION_ERROR', message: 'Invalid automation rule data' } }
    }
    return { error: { code: 'UPDATE_AUTOMATION_RULE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Delete automation rule
ipcMain.handle('automation:deleteRule', async (_, id: string) => {
  try {
    await client.query('DELETE FROM automation_rule WHERE id = $1', [id])
    return { success: true }
  } catch (error) {
    return { error: { code: 'DELETE_AUTOMATION_RULE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Toggle automation rule status
ipcMain.handle('automation:toggleRule', async (_, id: string) => {
  try {
    await client.query(`
      UPDATE automation_rule 
      SET is_active = NOT is_active, updated_at = $2
      WHERE id = $1
    `, [id, new Date().toISOString()])
    
    return { success: true }
  } catch (error) {
    return { error: { code: 'TOGGLE_AUTOMATION_RULE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Get rules that need to be processed today
ipcMain.handle('automation:getDueRules', async () => {
  try {
    const today = new Date().toISOString().split('T')[0]
    
    const result = await client.query(`
      SELECT 
        ar.id,
        ar.client_id,
        ar.name,
        ar.day_of_month,
        ar.amount,
        ar.currency,
        ar.description,
        ar.subject_template,
        ar.body_template,
        ar.cc_emails,
        c.name as client_name,
        c.email as client_email
      FROM automation_rule ar
      LEFT JOIN client c ON ar.client_id = c.id
      WHERE ar.is_active = true 
        AND ar.next_due_date <= $1
        AND c.email IS NOT NULL
      ORDER BY ar.created_at ASC
    `, [today])
    
    return {
      rules: result.rows.map((row: any) => {
        let ccEmails: string[] | undefined
        try {
          ccEmails = row.cc_emails ? JSON.parse(row.cc_emails) : undefined
        } catch {
          ccEmails = undefined
        }
        
        return {
          id: row.id,
          clientId: row.client_id,
          clientName: row.client_name,
          clientEmail: row.client_email,
          name: row.name,
          dayOfMonth: row.day_of_month,
          amount: row.amount,
          currency: row.currency,
          description: row.description,
          subjectTemplate: row.subject_template,
          bodyTemplate: row.body_template,
          ccEmails
        }
      })
    }
  } catch (error) {
    return { error: { code: 'GET_DUE_RULES_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Mark automation rule as processed
ipcMain.handle('automation:markRuleProcessed', async (_, ruleId: string, invoiceId?: string) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    
    // Get the rule to calculate next due date
    const ruleResult = await client.query('SELECT day_of_month FROM automation_rule WHERE id = $1', [ruleId])
    if (ruleResult.rows.length === 0) {
      return { error: { code: 'RULE_NOT_FOUND', message: 'Automation rule not found' } }
    }
    
    const dayOfMonth = (ruleResult.rows[0] as any).day_of_month
    
    // Calculate next due date (next month, same day)
    const now = new Date()
    const nextDue = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth)
    
    await client.query(`
      UPDATE automation_rule 
      SET 
        last_sent_date = $2,
        next_due_date = $3,
        updated_at = $4
      WHERE id = $1
    `, [ruleId, today, nextDue.toISOString().split('T')[0], new Date().toISOString()])
    
    return { success: true }
  } catch (error) {
    return { error: { code: 'MARK_RULE_PROCESSED_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})
