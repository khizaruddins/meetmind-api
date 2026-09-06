import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

export interface InvoicePdfData {
  id: string;
  invoiceNumber: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  createdAt: Date | string;
  user?: {
    id: string;
    email: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profile?: {
      country?: string | null;
      timezone?: string | null;
    } | null;
  } | null;
  subscription?: {
    id: string;
    status: string;
    provider?: string | null;
    providerSubscriptionId?: string | null;
    plan?: {
      code: string;
      name: string;
      description?: string | null;
      priceAmount: number;
      currency: string;
    } | null;
  } | null;
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Invoice - ${data.invoiceNumber}`,
            Author: 'MeetMind Technologies',
            Subject: 'Tax Invoice / Payment Receipt',
            Creator: 'MeetMind Invoicing Engine',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const totalCents = data.amountPaid || data.amountDue || 0;
        const totalAmount = totalCents / 100;
        const currency = (data.currency || 'INR').toUpperCase();
        const currencySymbol = currency === 'INR' ? 'INR ' : `${currency} `;

        const customerName =
          data.user?.displayName ||
          [data.user?.firstName, data.user?.lastName].filter(Boolean).join(' ') ||
          'Valued Customer';
        const customerEmail = data.user?.email || 'N/A';
        const customerCountry = data.user?.profile?.country || 'India';

        const planName =
          data.subscription?.plan?.name ||
          (data.invoiceNumber.includes('GOLD')
            ? 'Gold Plan'
            : data.invoiceNumber.includes('SILVER')
            ? 'Silver Plan'
            : 'Pro Subscription');

        const issueDate = new Date(data.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        const periodStartStr = new Date(data.periodStart).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        const periodEndStr = new Date(data.periodEnd).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

        const pageWidth = 595.28;
        const margin = 40;
        const contentWidth = pageWidth - margin * 2;

        // --- 1. HEADER SECTION ---
        // Brand Title
        doc.fillColor('#E11D48').font('Helvetica-Bold').fontSize(22).text('MeetMind', margin, 40);
        doc.fillColor('#64748B').font('Helvetica').fontSize(9).text('AI Meeting Intelligence & Recording Platform', margin, 65);
        doc.fillColor('#334155').fontSize(8.5).text('MeetMind Technologies Inc.', margin, 78);
        doc.fillColor('#64748B').fontSize(8).text('204 Sai Ganesh Apartment, Sadi Compound, Nallasopara East, Palghar 401209', margin, 90);
        doc.fillColor('#64748B').fontSize(8).text('support@meetmind.io  |  https://meetmind.io', margin, 102);

        // Right-aligned Invoice Title & Meta
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(18).text('INVOICE / RECEIPT', margin, 40, {
          align: 'right',
          width: contentWidth,
        });

        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9).text(`Invoice #: ${data.invoiceNumber}`, margin, 65, {
          align: 'right',
          width: contentWidth,
        });
        doc.font('Helvetica').fontSize(8.5).text(`Issue Date: ${issueDate}`, margin, 78, {
          align: 'right',
          width: contentWidth,
        });
        doc.font('Helvetica').fontSize(8.5).text(`Billing Period: ${periodStartStr} - ${periodEndStr}`, margin, 90, {
          align: 'right',
          width: contentWidth,
        });

        // Payment Status Badge (PAID)
        const badgeX = pageWidth - margin - 80;
        const badgeY = 104;
        doc.roundedRect(badgeX, badgeY, 80, 20, 4).fillAndStroke('#ECFDF5', '#10B981');
        doc.fillColor('#047857').font('Helvetica-Bold').fontSize(10).text(data.status.toUpperCase(), badgeX, badgeY + 5, {
          width: 80,
          align: 'center',
        });

        // Horizontal Line
        doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(margin, 135).lineTo(pageWidth - margin, 135).stroke();

        // --- 2. BILLED TO & PAYMENT INFO ---
        const metaBoxY = 148;
        const halfWidth = contentWidth / 2 - 10;

        // Billed To Box
        doc.roundedRect(margin, metaBoxY, halfWidth, 75, 4).fillAndStroke('#F8FAFC', '#E2E8F0');
        doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(8).text('BILLED TO (CUSTOMER)', margin + 12, metaBoxY + 10);
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text(customerName, margin + 12, metaBoxY + 22);
        doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text(customerEmail, margin + 12, metaBoxY + 36);
        doc.fillColor('#64748B').fontSize(8).text(`Country: ${customerCountry}  |  Account ID: ${data.user?.id ? data.user.id.slice(0, 8) + '...' : 'N/A'}`, margin + 12, metaBoxY + 50);

        // Payment & Subscription Box
        const rightBoxX = margin + halfWidth + 20;
        doc.roundedRect(rightBoxX, metaBoxY, halfWidth, 75, 4).fillAndStroke('#F8FAFC', '#E2E8F0');
        doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(8).text('PAYMENT & SUBSCRIPTION DETAILS', rightBoxX + 12, metaBoxY + 10);
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(`Plan: ${planName}`, rightBoxX + 12, metaBoxY + 22);
        doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text('Billing Frequency: Monthly Recurring', rightBoxX + 12, metaBoxY + 36);
        doc.fillColor('#475569').fontSize(8).text(`Payment Provider: ${data.subscription?.provider ? data.subscription.provider.toUpperCase() : 'RAZORPAY'} (Verified)`, rightBoxX + 12, metaBoxY + 50);

        // --- 3. TABULAR ITEM BREAKDOWN ---
        const tableY = 240;
        const col1 = margin + 10;          // Item (w: 220)
        const col2 = margin + 235;         // Interval (w: 75)
        const col3 = margin + 315;         // Qty (w: 35)
        const col4 = margin + 355;         // Taxable Value (w: 75)
        const col5 = margin + 435;         // Total (w: 80)

        // Table Header
        doc.rect(margin, tableY, contentWidth, 24).fill('#0F172A');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
        doc.text('#  ITEM & DESCRIPTION', col1, tableY + 7);
        doc.text('BILLING CYCLE', col2, tableY + 7, { width: 75, align: 'center' });
        doc.text('QTY', col3, tableY + 7, { width: 35, align: 'center' });
        doc.text('PRICE / RATE', col4, tableY + 7, { width: 75, align: 'right' });
        doc.text('AMOUNT', col5, tableY + 7, { width: 70, align: 'right' });

        // Item Row 1
        const row1Y = tableY + 24;
        doc.rect(margin, row1Y, contentWidth, 54).fillAndStroke('#FFFFFF', '#E2E8F0');

        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(`1. MeetMind ${planName} Subscription`, col1, row1Y + 10);
        doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(
          'Unlimited daily recording, automated speech-to-text intelligence, action item extraction & team workspace.',
          col1,
          row1Y + 24,
          { width: 215 }
        );

        doc.fillColor('#334155').font('Helvetica').fontSize(8.5).text('Monthly', col2, row1Y + 16, { width: 75, align: 'center' });
        doc.text('1', col3, row1Y + 16, { width: 35, align: 'center' });
        doc.text(`${currencySymbol}${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, col4, row1Y + 16, { width: 75, align: 'right' });
        doc.font('Helvetica-Bold').text(`${currencySymbol}${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, col5, row1Y + 16, { width: 70, align: 'right' });

        // --- 4. SUMMARY (SUBSCRIPTION AMOUNT ONLY, NO GST) ---
        const summaryStartY = row1Y + 65;
        const sumLabelX = margin + 280;
        const sumValX = margin + 420;
        const sumWidth = 95;

        // Subtotal
        doc.fillColor('#64748B').font('Helvetica').fontSize(9).text('Subscription Subtotal:', sumLabelX, summaryStartY);
        doc.fillColor('#1E293B').font('Helvetica').text(`${currencySymbol}${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, sumValX, summaryStartY, { width: sumWidth, align: 'right' });

        // Grand Total Box
        const grandTotalY = summaryStartY + 24;
        doc.rect(sumLabelX - 10, grandTotalY, contentWidth - (sumLabelX - margin) + 10, 30).fill('#0F172A');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('TOTAL PAID:', sumLabelX, grandTotalY + 9);
        doc.fillColor('#34D399').fontSize(11).text(
          `${currencySymbol}${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${currency}`,
          sumValX,
          grandTotalY + 9,
          { width: sumWidth, align: 'right' }
        );

        // --- 5. PAYMENT ACKNOWLEDGMENT NOTE ---
        const noteY = grandTotalY + 45;
        doc.roundedRect(margin, noteY, contentWidth, 40, 4).fillAndStroke('#F1F5F9', '#CBD5E1');
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text('Payment Acknowledgment', margin + 12, noteY + 8);
        doc.fillColor('#475569').font('Helvetica').fontSize(8).text(
          `Payment of ${currencySymbol}${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} received in full via Razorpay gateway. Thank you for subscribing to MeetMind!`,
          margin + 12,
          noteY + 22
        );

        // --- 6. FOOTER ---
        const footerY = 750;
        doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(margin, footerY).lineTo(pageWidth - margin, footerY).stroke();
        doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5).text(
          'This is an electronically generated invoice / payment receipt and requires no physical signature.',
          margin,
          footerY + 10,
          { align: 'center', width: contentWidth }
        );
        doc.text(
          'MeetMind Technologies Inc.  •  204 Sai Ganesh Apartment, Sadi Compound, Nallasopara East, Palghar 401209  •  support@meetmind.io',
          margin,
          footerY + 22,
          { align: 'center', width: contentWidth }
        );

        doc.end();
      } catch (err) {
        this.logger.error('Failed to generate invoice PDF:', err);
        reject(err);
      }
    });
  }
}
