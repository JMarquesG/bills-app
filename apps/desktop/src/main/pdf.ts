import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { promises as fs } from 'node:fs'

interface InvoiceData {
  number: string
  clientName: string
  issueDate: string
  amount: string
  currency: string
  outputPath: string
  seller?: {
    name?: string
    address?: string
    email?: string
    phone?: string
    taxId?: string
    bankName?: string
    bankAccount?: string
    iban?: string
    swift?: string
  } | null
}

export async function generateInvoicePdf(data: InvoiceData): Promise<void> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create()
  
  // Add a page
  const page = pdfDoc.addPage([595, 842]) // A4 size
  const { width, height } = page.getSize()
  
  // Get fonts
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  
  // Colors
  const darkGray = rgb(0.2, 0.2, 0.2)
  const mediumGray = rgb(0.4, 0.4, 0.4)
  const lightGray = rgb(0.8, 0.8, 0.8)
  
  // Title
  page.drawText('INVOICE', {
    x: 50,
    y: height - 80,
    size: 32,
    font: fontBold,
    color: darkGray
  })
  
  // Invoice details section
  let yPosition = height - 140
  // Seller info block (if provided)
  if (data.seller) {
    const seller = data.seller
    const lines: string[] = []
    if (seller.name) lines.push(seller.name)
    if (seller.address) lines.push(seller.address)
    if (seller.email || seller.phone) lines.push([seller.email, seller.phone].filter(Boolean).join(' · '))
    if (seller.taxId) lines.push(`Tax ID: ${seller.taxId}`)
    if (seller.bankName || seller.iban) {
      const bankBits = [seller.bankName, seller.bankAccount, seller.iban, seller.swift].filter(Boolean)
      if (bankBits.length) lines.push(bankBits.join(' · '))
    }
    if (lines.length) {
      page.drawText('From:', { x: 350, y: height - 140, size: 12, font: fontBold, color: mediumGray })
      let sy = height - 165
      for (const line of lines) {
        page.drawText(line, { x: 350, y: sy, size: 11, font: fontRegular, color: darkGray })
        sy -= 16
      }
    }
  }

  
  // Invoice number
  page.drawText('Invoice Number:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: fontBold,
    color: mediumGray
  })
  
  page.drawText(data.number, {
    x: 180,
    y: yPosition,
    size: 12,
    font: fontRegular,
    color: darkGray
  })
  
  yPosition -= 25
  
  // Issue date
  page.drawText('Issue Date:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: fontBold,
    color: mediumGray
  })
  
  const formattedDate = new Date(data.issueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  
  page.drawText(formattedDate, {
    x: 180,
    y: yPosition,
    size: 12,
    font: fontRegular,
    color: darkGray
  })
  
  yPosition -= 25
  
  // Client name
  page.drawText('Bill To:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: fontBold,
    color: mediumGray
  })
  
  page.drawText(data.clientName, {
    x: 180,
    y: yPosition,
    size: 12,
    font: fontRegular,
    color: darkGray
  })
  
  // Separator line
  yPosition -= 50
  page.drawLine({
    start: { x: 50, y: yPosition },
    end: { x: width - 50, y: yPosition },
    thickness: 1,
    color: lightGray
  })
  
  // Amount section
  yPosition -= 40
  
  page.drawText('Amount:', {
    x: 50,
    y: yPosition,
    size: 14,
    font: fontBold,
    color: mediumGray
  })
  
  // Format amount (assuming it's a string with decimal)
  const formattedAmount = parseFloat(data.amount).toFixed(2)
  const amountText = `${formattedAmount} ${data.currency}`
  
  page.drawText(amountText, {
    x: width - 150,
    y: yPosition,
    size: 18,
    font: fontBold,
    color: darkGray
  })
  
  // Total section with background
  yPosition -= 60
  const totalBoxHeight = 40
  const totalBoxWidth = width - 100
  
  // Background rectangle
  page.drawRectangle({
    x: 50,
    y: yPosition - 15,
    width: totalBoxWidth,
    height: totalBoxHeight,
    color: rgb(0.95, 0.95, 0.95)
  })
  
  page.drawText('TOTAL:', {
    x: 70,
    y: yPosition,
    size: 16,
    font: fontBold,
    color: darkGray
  })
  
  page.drawText(amountText, {
    x: width - 150,
    y: yPosition,
    size: 20,
    font: fontBold,
    color: darkGray
  })
  
  // Footer
  const footerY = 80
  page.drawText('Thank you for your business!', {
    x: 50,
    y: footerY,
    size: 10,
    font: fontRegular,
    color: mediumGray
  })
  
  page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
    x: width - 150,
    y: footerY,
    size: 8,
    font: fontRegular,
    color: mediumGray
  })
  
  // Save the PDF
  const pdfBytes = await pdfDoc.save()
  await fs.writeFile(data.outputPath, pdfBytes)
}
