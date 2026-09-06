import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Invoices')
@Controller('v1/invoices')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(
    private readonly billingService: BillingService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List customer billing invoices' })
  async list(@CurrentUser() user: any) {
    return this.billingService.listInvoices(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of an invoice' })
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.billingService.getInvoice(user.id, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generate and download official PDF tax invoice' })
  async downloadPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const invoice = await this.billingService.getInvoice(user.id, id);
    const pdfBuffer = await this.invoicePdfService.generateInvoicePdf(invoice);

    const safeFilename = `Invoice-${invoice.invoiceNumber || id}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    res.send(pdfBuffer);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get downloadable invoice URL / PDF URL' })
  async download(@CurrentUser() user: any, @Param('id') id: string) {
    const invoice = await this.billingService.getInvoice(user.id, id);
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: `/v1/invoices/${invoice.id}/pdf`,
      url: invoice.invoiceUrl,
    };
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send invoice receipt to customer email' })
  async sendEmail(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('recipientEmail') recipientEmail?: string,
  ) {
    return this.billingService.sendInvoiceEmail(user.id, id, recipientEmail);
  }
}
