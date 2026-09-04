import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminBillingService } from './admin-billing.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('Admin Billing & Invoices')
@Controller('v1/admin')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminBillingController {
  constructor(private readonly adminBillingService: AdminBillingService) {}

  @Get('payments')
  @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'List customer payment transactions' })
  async listPayments(@Query() query: PaginationQueryDto, @Query('status') status?: string, @Query('userId') userId?: string) {
    return this.adminBillingService.listPayments({ ...query, status, userId });
  }

  @Get('payments/:id')
  @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'Get details of a payment transaction' })
  async getPayment(@Param('id') id: string) {
    return this.adminBillingService.getPayment(id);
  }

  @Get('invoices')
  @RequirePermissions('invoices.read')
  @ApiOperation({ summary: 'List customer invoices' })
  async listInvoices(@Query() query: PaginationQueryDto, @Query('status') status?: string, @Query('userId') userId?: string) {
    return this.adminBillingService.listInvoices({ ...query, status, userId });
  }

  @Get('invoices/:id')
  @RequirePermissions('invoices.read')
  @ApiOperation({ summary: 'Get details of an invoice' })
  async getInvoice(@Param('id') id: string) {
    return this.adminBillingService.getInvoice(id);
  }

  @Post('invoices/:id/retry-payment')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('billing.read')
  @ApiOperation({ summary: 'Retry payment for an open or failed invoice' })
  async retryPayment(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminBillingService.retryPayment(id, admin.id);
  }

  @Post('invoices/:id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('billing.read')
  @ApiOperation({ summary: 'Void an invoice' })
  async voidInvoice(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminBillingService.voidInvoice(id, admin.id);
  }

  @Post('invoices/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('billing.read')
  @ApiOperation({ summary: 'Resend invoice email to customer' })
  async sendInvoice(@Param('id') id: string, @CurrentAdmin() admin: any) {
    return this.adminBillingService.sendInvoice(id, admin.id);
  }
}
