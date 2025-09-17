import * as cron from 'node-cron'
import { createHash } from 'node:crypto'
import { client } from '@bills/db'
import { generateInvoicePdf } from './pdf'
import nodemailer from 'nodemailer'
import { join } from 'node:path'
import { app } from 'electron'
import { promises as fs } from 'node:fs'

interface AutomationRule {
  id: string
  clientId: string
  clientName: string
  clientEmail: string
  name: string
  dayOfMonth: number
  amount: string
  currency: string
  description: string
  subjectTemplate: string
  bodyTemplate: string
  ccEmails?: string[]
}

let schedulerTask: cron.ScheduledTask | null = null

function generateId(): string {
  return createHash('md5').update(Date.now().toString() + Math.random().toString()).digest('hex').substring(0, 8)
}

async function getSmtpConfig(): Promise<any> {
  try {
    const result = await client.query('SELECT smtp_config FROM setting WHERE id = 1')
    const text = (result.rows?.[0] as any)?.smtp_config as string | undefined
    return text ? JSON.parse(text) : null
  } catch (error) {
    return null
  }
}

async function getCompanyProfile(): Promise<any> {
  try {
    const result = await client.query('SELECT company_profile FROM setting WHERE id = 1')
    const text = (result.rows?.[0] as any)?.company_profile as string | undefined
    return text ? JSON.parse(text) : null
  } catch (error) {
    return null
  }
}

async function generateInvoiceNumber(): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  
  // Get the last invoice number for this month
  const result = await client.query(`
    SELECT number FROM invoice 
    WHERE number LIKE '${year}-${month}-%' 
    ORDER BY created_at DESC 
    LIMIT 1
  `)
  
  let nextNumber = 1
  if (result.rows.length > 0) {
    const lastNumber = (result.rows[0] as any).number
    const parts = lastNumber.split('-')
    if (parts.length === 3) {
      nextNumber = parseInt(parts[2]) + 1
    }
  }
  
  return `${year}-${month}-${String(nextNumber).padStart(3, '0')}`
}

async function getBillsFolder(): Promise<string> {
  const result = await client.query('SELECT data_root FROM setting WHERE id = 1')
  const dataRoot = (result.rows?.[0] as any)?.data_root
  if (dataRoot) {
    return join(dataRoot, 'bills')
  }
  
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    return join(process.cwd(), 'test', 'bills')
  }
  return join(app.getPath('userData'), 'bills')
}

async function createInvoiceFolder(invoiceNumber: string): Promise<string> {
  const billsFolder = await getBillsFolder()
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  
  const folderName = `${year}-${month}-${day}__AUTO__${invoiceNumber}`
  const folderPath = join(billsFolder, year.toString(), month, folderName)
  
  await fs.mkdir(folderPath, { recursive: true })
  return folderPath
}

async function processAutomationRule(rule: AutomationRule): Promise<{ success: boolean; error?: string; invoiceId?: string }> {
  try {
    console.log(`Processing automation rule: ${rule.name} for client: ${rule.clientName}`)
    
    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber()
    
    // Create invoice folder
    const folderPath = await createInvoiceFolder(invoiceNumber)
    const pdfPath = join(folderPath, `Factura-${invoiceNumber}.pdf`)
    
    // Get company profile
    const companyProfile = await getCompanyProfile()
    
    // Create invoice in database
    const invoiceId = generateId()
    const now = new Date()
    const issueDate = now.toISOString().split('T')[0]
    
    await client.query(`
      INSERT INTO invoice (
        id, number, client_id, issue_date, amount, currency, 
        status, file_path, folder_path, description, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    `, [
      invoiceId,
      invoiceNumber,
      rule.clientId,
      issueDate,
      rule.amount,
      rule.currency,
      'SENT',
      pdfPath,
      folderPath,
      rule.description,
      `Automated invoice: ${rule.name}`,
      now.toISOString()
    ])
    
    // Generate PDF
    await generateInvoicePdf({
      number: invoiceNumber,
      clientName: rule.clientName,
      issueDate,
      amount: rule.amount,
      currency: rule.currency,
      outputPath: pdfPath,
      seller: companyProfile,
      client: null, // We'll need to fetch client details if needed
      items: [{
        description: rule.description,
        amount: rule.amount
      }],
      description: rule.description,
      notes: null
    })
    
    // Send email
    await sendAutomationEmail(rule, invoiceNumber, pdfPath, companyProfile)
    
    // Mark rule as processed
    await markRuleProcessed(rule.id, invoiceId)
    
    console.log(`✅ Automation rule processed successfully: ${rule.name}`)
    return { success: true, invoiceId }
    
  } catch (error) {
    console.error(`❌ Failed to process automation rule ${rule.name}:`, error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

async function sendAutomationEmail(rule: AutomationRule, invoiceNumber: string, pdfPath: string, companyProfile: any) {
  const smtpConfig = await getSmtpConfig()
  if (!smtpConfig) {
    throw new Error('SMTP configuration is not set up')
  }
  
  // Create transporter
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password
    }
  })
  
  // Replace template variables
  const subject = rule.subjectTemplate
    .replace(/\{invoiceNumber\}/g, invoiceNumber)
    .replace(/\{clientName\}/g, rule.clientName)
    .replace(/\{companyName\}/g, companyProfile?.name || 'Your Company')
  
  const htmlBody = rule.bodyTemplate
    .replace(/\{clientName\}/g, rule.clientName)
    .replace(/\{invoiceNumber\}/g, invoiceNumber)
    .replace(/\{amount\}/g, formatCurrency(parseFloat(rule.amount), rule.currency))
    .replace(/\{companyName\}/g, companyProfile?.name || 'Your Company')
    .replace(/\{description\}/g, rule.description)
  
  // Prepare email options
  const fromEmail = companyProfile?.email || smtpConfig.user
  const fromName = companyProfile?.name || 'Billing App'
  
  const mailOptions: any = {
    from: `${fromName} <${fromEmail}>`,
    to: rule.clientEmail,
    subject,
    html: htmlBody,
    attachments: [{
      filename: `Factura-${invoiceNumber}.pdf`,
      path: pdfPath
    }]
  }
  
  // Add CC recipients if provided
  if (rule.ccEmails && rule.ccEmails.length > 0) {
    mailOptions.cc = rule.ccEmails.join(', ')
  }
  
  // Send email
  await transporter.sendMail(mailOptions)
  const ccInfo = rule.ccEmails && rule.ccEmails.length > 0 ? ` (CC: ${rule.ccEmails.join(', ')})` : ''
  console.log(`📧 Email sent to ${rule.clientEmail}${ccInfo} for invoice ${invoiceNumber}`)
}

async function markRuleProcessed(ruleId: string, invoiceId: string) {
  const today = new Date().toISOString().split('T')[0]
  
  // Get the rule to calculate next due date
  const ruleResult = await client.query('SELECT day_of_month FROM automation_rule WHERE id = $1', [ruleId])
  if (ruleResult.rows.length === 0) {
    throw new Error('Automation rule not found')
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
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ca-ES', {
      style: 'currency',
      currency
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

async function processDueAutomations() {
  try {
    console.log('🔄 Checking for due automations...')
    
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
    
    const dueRules = result.rows.map((row: any) => {
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
    
    if (dueRules.length === 0) {
      console.log('✅ No due automations found')
      return
    }
    
    console.log(`📋 Found ${dueRules.length} due automation(s)`)
    
    // Process each rule
    for (const rule of dueRules) {
      await processAutomationRule(rule)
      // Add a small delay between processing rules
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    console.log('✅ All due automations processed')
    
  } catch (error) {
    console.error('❌ Error processing due automations:', error)
  }
}

export function startAutomationScheduler() {
  if (schedulerTask) {
    console.log('🔄 Automation scheduler already running')
    return
  }
  
  // Run every day at 9:00 AM
  schedulerTask = cron.schedule('0 9 * * *', processDueAutomations, {
    timezone: 'Europe/Madrid'
  })
  
  schedulerTask.start()
  console.log('🚀 Automation scheduler started (daily at 9:00 AM)')
  
  // Also run on startup for testing (with a delay to ensure DB is ready)
  setTimeout(() => {
    processDueAutomations()
  }, 5000)
}

export function stopAutomationScheduler() {
  if (schedulerTask) {
    schedulerTask.stop()
    schedulerTask.destroy()
    schedulerTask = null
    console.log('🛑 Automation scheduler stopped')
  }
}

// Manual trigger for testing
export function triggerAutomationCheck() {
  processDueAutomations()
}
