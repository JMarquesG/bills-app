import { ipcMain } from 'electron'
import { z } from 'zod'
import nodemailer from 'nodemailer'
import { client } from '@bills/db'

const sendInvoiceEmailSchema = z.object({
  billId: z.string().min(1),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  attachmentPath: z.string().optional(),
  ccEmails: z.array(z.string().email()).optional()
})

async function getSmtpConfig(): Promise<any> {
  try {
    const result = await client.query('SELECT smtp_config FROM setting WHERE id = 1')
    const text = (result.rows?.[0] as any)?.smtp_config as string | undefined
    return text ? JSON.parse(text) : null
  } catch (error) {
    return null
  }
}

async function getBillDetails(billId: string) {
  try {
    const result = await client.query(`
      SELECT 
        i.number,
        i.amount,
        i.currency,
        i.file_path,
        c.name as client_name,
        c.email as client_email
      FROM invoice i
      LEFT JOIN client c ON i.client_id = c.id
      WHERE i.id = $1
    `, [billId])
    
    if (result.rows.length === 0) {
      return null
    }
    
    const row = result.rows[0] as any
    return {
      number: row.number,
      amount: row.amount,
      currency: row.currency,
      filePath: row.file_path,
      clientName: row.client_name,
      clientEmail: row.client_email
    }
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

ipcMain.handle('email:sendInvoice', async (_, data: unknown) => {
  try {
    // Validate input
    const parsed = sendInvoiceEmailSchema.parse(data)
    
    // Get SMTP configuration
    const smtpConfig = await getSmtpConfig()
    if (!smtpConfig) {
      return { error: { code: 'NO_SMTP_CONFIG', message: 'SMTP configuration is not set up' } }
    }
    
    // Get bill details
    const billDetails = await getBillDetails(parsed.billId)
    if (!billDetails) {
      return { error: { code: 'BILL_NOT_FOUND', message: 'Bill not found' } }
    }
    
    // Get company profile for sender info
    const companyProfile = await getCompanyProfile()
    
    // Check if client has email
    if (!billDetails.clientEmail) {
      return { error: { code: 'NO_CLIENT_EMAIL', message: 'Client email address is not available' } }
    }
    
    // Create transporter
    const transporter = nodemailer.createTransporter({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.password
      }
    })
    
    // Verify connection
    await transporter.verify()
    
    // Prepare email options
    const fromEmail = companyProfile?.email || smtpConfig.user
    const fromName = companyProfile?.name || 'Billing App'
    
    const mailOptions: any = {
      from: `${fromName} <${fromEmail}>`,
      to: billDetails.clientEmail,
      subject: parsed.subject,
      html: parsed.htmlBody
    }
    
    // Add CC recipients if provided
    if (parsed.ccEmails && parsed.ccEmails.length > 0) {
      mailOptions.cc = parsed.ccEmails.join(', ')
    }
    
    // Add attachment if PDF file exists
    if (billDetails.filePath && parsed.attachmentPath) {
      try {
        const fs = await import('node:fs')
        await fs.promises.access(parsed.attachmentPath)
        mailOptions.attachments = [{
          filename: `Factura-${billDetails.number}.pdf`,
          path: parsed.attachmentPath
        }]
      } catch (error) {
        console.warn('PDF attachment not found, sending without attachment:', error)
      }
    }
    
    // Send email
    const info = await transporter.sendMail(mailOptions)
    
    const ccInfo = parsed.ccEmails && parsed.ccEmails.length > 0 ? ` (CC: ${parsed.ccEmails.join(', ')})` : ''
    console.log(`📧 Email sent to ${billDetails.clientEmail}${ccInfo} - Message ID: ${info.messageId}`)
    
    return { 
      success: true, 
      messageId: info.messageId,
      recipient: billDetails.clientEmail,
      ccRecipients: parsed.ccEmails,
      subject: parsed.subject
    }
  } catch (error) {
    console.error('Email sending error:', error)
    
    if (error instanceof z.ZodError) {
      return { error: { code: 'VALIDATION_ERROR', message: 'Invalid email data provided' } }
    }
    
    return { 
      error: { 
        code: 'EMAIL_SEND_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown email error' 
      } 
    }
  }
})
