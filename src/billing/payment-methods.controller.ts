import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payment Methods')
@Controller('v1/payment-methods')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class PaymentMethodsController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'List customer saved payment methods (masked cards)' })
  async list(@CurrentUser() user: any) {
    return this.billingService.listPaymentMethods(user.id);
  }

  @Post('setup')
  @ApiOperation({ summary: 'Initiate provider-hosted payment method setup' })
  async setup(@CurrentUser() user: any) {
    return this.billingService.setupPaymentMethod(user.id);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set payment method as default for renewals' })
  async setDefault(@CurrentUser() user: any, @Param('id') id: string) {
    return this.billingService.setDefaultPaymentMethod(user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved payment method' })
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.billingService.deletePaymentMethod(user.id, id);
  }
}
