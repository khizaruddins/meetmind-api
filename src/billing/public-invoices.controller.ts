import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { InvoicePdfService } from './invoice-pdf.service';

@ApiTags('Public Invoices')
@Controller('v1/public/invoices')
export class PublicInvoicesController {
  constructor(
    private readonly billingService: BillingService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get public invoice details by ID or Invoice Number' })
  async getInvoice(@Param('id') id: string) {
    const cleanId = id.replace(/\.pdf$/i, '');
    return this.billingService.getPublicInvoice(cleanId);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download public invoice PDF by ID or Invoice Number' })
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const cleanId = id.replace(/\.pdf$/i, '');
    const invoice = await this.billingService.getPublicInvoice(cleanId);
    const pdfBuffer = await this.invoicePdfService.generateInvoicePdf(invoice as any);

    const safeFilename = `Invoice-${invoice.invoiceNumber || cleanId}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    res.send(pdfBuffer);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send invoice receipt to client email' })
  async sendEmail(
    @Param('id') id: string,
    @Body('recipientEmail') recipientEmail?: string,
  ) {
    const cleanId = id.replace(/\.pdf$/i, '');
    return this.billingService.sendPublicInvoiceEmail(cleanId, recipientEmail);
  }
}
