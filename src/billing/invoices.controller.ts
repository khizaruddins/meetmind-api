import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Invoices')
@Controller('v1/invoices')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly billingService: BillingService) {}

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

  @Get(':id/download')
  @ApiOperation({ summary: 'Get downloadable invoice URL / PDF URL' })
  async download(@CurrentUser() user: any, @Param('id') id: string) {
    const invoice = await this.billingService.getInvoice(user.id, id);
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      url: invoice.invoiceUrl,
      pdfUrl: invoice.invoicePdfUrl,
    };
  }
}
