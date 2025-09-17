import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";

interface Party {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
  taxId?: string;
}

interface BankInfo {
  bankName?: string;
  bankAccount?: string;
  iban?: string;
  swift?: string;
}

interface InvoiceItem {
  description: string;
  amount: string;
}

interface InvoiceData {
  number: string;
  clientName: string;
  issueDate: string;
  expectedPaymentDate?: string;
  amount: string;
  currency: string;
  outputPath: string;
  seller?: (Party & BankInfo) | null;
  client?: Party | null;
  items?: InvoiceItem[];
  description?: string | null;
  notes?: string | null;
}

function formatCurrencyEU(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ca-ES", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function drawWrappedText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  options: { font: string; size: number; color: string; maxWidth: number }
): number {
  try {
    // Always use safe fonts

    doc.font(options.font).fontSize(options.size)
    doc.text(text, x, y, { width: options.maxWidth, align: "left" });
    return doc.y;
  } catch (error) {
    console.warn("Font error, falling back to Helvetica:", error);
    doc.font("Helvetica").fontSize(options.size)
    doc.text(text, x, y, { width: options.maxWidth, align: "left" });
    return doc.y;
  }
}

export async function generateInvoicePdf(data: InvoiceData): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, left: 50, right: 50, bottom: 60 },
        info: {
          Title: `Factura ${data.number}`,
          Author: data.seller?.name || "Billing App",
          Subject: `Factura para ${data.clientName}`,
          Creator: "Billing App",
          Producer: "PDFKit",
        },
      });

      const { width, height } = doc.page;

      const dark = "#1f2937"; // slate-800
      const mid = "#6b7280"; // slate-500
      const light = "#e5e7eb"; // slate-200
      const margin = 50;

      const out = createWriteStream(data.outputPath);
      doc.pipe(out);

      // Handle stream events properly
      out.on("error", (error) => {
        console.error("PDF write stream error:", error);
        reject(error);
      });

      out.on("finish", () => {
        console.log("PDF generated successfully:", data.outputPath);
        resolve();
      });

      // Title: FACTURA centered at top
      doc.font("Helvetica-Bold").fontSize(28)
      const facturaWidth = doc.widthOfString("FACTURA");
      doc.text("FACTURA", (width - facturaWidth) / 2, 50);

      let currentY = 90;

      // Seller block (full width, stacked)
      if (data.seller) {
        const s = data.seller;
        
        if (s.name) {
          doc
            .font("Helvetica-Bold")
            .fontSize(16)
            
            .text(s.name, margin, currentY);
          currentY += 22;
        }
        
        if (s.taxId) {
          doc
            .font("Helvetica")
            .fontSize(10)
            
            .text(`NIF: ${s.taxId}`, margin, currentY);
          currentY += 14;
        }
        
        const contactInfo: string[] = [];
        if (s.address) contactInfo.push(s.address);
        if (s.phone) contactInfo.push(s.phone);
        if (s.email) contactInfo.push(s.email);
        
        doc.font("Helvetica").fontSize(10)
        for (const line of contactInfo) {
          doc.text(line, margin, currentY);
          currentY += 12;
        }
        
        // Bank info on separate line if exists
        const bankBits = [s.bankName, s.bankAccount, s.iban, s.swift].filter(Boolean);
        if (bankBits.length) {
          doc.font("Helvetica").fontSize(10)
          doc.text(bankBits.join(" · "), margin, currentY);
          currentY += 14;
        }
        
        currentY += 10; // Extra space after seller info
      }

      // Invoice metadata (stacked vertically)
      doc.font("Helvetica-Bold").fontSize(10)
      doc.text("DATA:", margin, currentY);
      const dateCa = new Date(data.issueDate).toLocaleDateString("ca-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.font("Helvetica").fontSize(10)
      doc.text(dateCa, margin + 60, currentY);
      currentY += 16;

      doc.font("Helvetica-Bold").fontSize(10)
      doc.text("N.º DE FACTURA:", margin, currentY);
      doc.font("Helvetica").fontSize(10)
      doc.text(data.number, margin + 100, currentY);
      currentY += 20;

      // Client information (stacked vertically)
      doc.font("Helvetica-Bold").fontSize(10)
      doc.text("FACTURAR A:", margin, currentY);
      currentY += 14;

      const clientLines = [];
      if (data.client?.name || data.clientName) {
        clientLines.push(data.client?.name || data.clientName);
      }
      if (data.client?.address) {
        clientLines.push(data.client?.address);
      }
      if (data.client?.taxId) {
        clientLines.push(`NIF: ${data.client.taxId}`);
      }
      if (data.client?.phone) {
        clientLines.push(data.client.phone);
      }
      if (data.client?.email) {
        clientLines.push(data.client.email);
      }

      doc.font("Helvetica").fontSize(10)
      for (const line of clientLines) {
        doc.text(line, margin, currentY);
        currentY += 12;
      }

      // Expected payment date if provided
      if (data.expectedPaymentDate) {
        currentY += 4;
        doc.font("Helvetica-Bold").fontSize(10)
        doc.text("VENCIMENT:", margin, currentY);
        const paymentDate = new Date(data.expectedPaymentDate).toLocaleDateString("ca-ES", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        doc.font("Helvetica").fontSize(10)
        doc.text(paymentDate, margin + 80, currentY);
        currentY += 16;
      }

      // Section separator line
      currentY += 10;
      const separatorY = currentY;
      doc
        .save()
        .moveTo(margin, separatorY)
        .lineTo(width - margin, separatorY)
        .lineWidth(1)
        .strokeColor(light)
        .stroke()
        .restore();

      // Table header
      let y = separatorY + 15;
      doc
        .save()
        .restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        
        .text("DESCRIPCIÓ", margin + 10, y);
      const importHeader = "IMPORT";
      const importHeaderWidth = doc.widthOfString(importHeader);
      doc.text(importHeader, width - margin - importHeaderWidth - 10, y);

      // Rows
      y += 28;
      const items =
        data.items && data.items.length
          ? data.items
          : [
              {
                description: data.description || "Serveis professionals",
                amount: data.amount,
              },
            ];
      const descColWidth = width - margin * 2 - 140;
      let total = 0;
      for (const item of items) {
        const amountNum = parseFloat(item.amount || "0") || 0;
        total += amountNum;
        const valueText = formatCurrencyEU(amountNum, data.currency);
        doc.font("Helvetica").fontSize(11)
        const startY = y;
        y = drawWrappedText(doc, item.description, margin + 12, y, {
          font: "Helvetica",
          size: 11,
          color: dark,
          maxWidth: descColWidth - 16,
        });
        const valueWidth = doc.widthOfString(valueText);
        doc.text(valueText, width - margin - valueWidth - 12, startY);
        y += 6;
        doc
          .save()
          .moveTo(margin, y - 2)
          .lineTo(width - margin, y - 2)
          .lineWidth(0.6)
          .strokeColor("#eeeeee")
          .stroke()
          .restore();
        y += 6;
      }

      // Total box
      y += 8;
      doc
        .save()
        .restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        
        .text("TOTAL", margin + 14, y + 10);
      const totalText = formatCurrencyEU(total, data.currency);
      const totalWidth = doc.widthOfString(totalText);
      doc.text(totalText, width - margin - totalWidth - 14, y + 10);

      // Notes / Observations
      if (data.notes) {
        y += 56;
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          
          .text("Observacions", margin, y);
        y += 14;
        y = drawWrappedText(doc, data.notes, margin, y, {
          font: "Helvetica",
          size: 10,
          color: dark,
          maxWidth: width - margin * 2,
        });
      }

      // Footer
      const paymentText = `A pagar en 30 dies`;
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        
        .text(paymentText, margin, doc.page.height - 150);
      y += 20;
      const taxExemptionText = `Factura exempta d'IGI segons l'article 43.2 i l'article 15 de la Llei 11/2012 de l'Impost General Indirecte (IGI)`;
      y = drawWrappedText(
        doc,
        taxExemptionText,
        margin,
        doc.page.height - 130,
        {
          font: "Helvetica",
          size: 9,
          color: mid,
          maxWidth: width - margin * 2,
        }
      );

      doc.end();
    } catch (error) {
      console.error("PDF generation error:", error);
      reject(error);
    }
  });
}
