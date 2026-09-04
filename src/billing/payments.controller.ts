import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('v1/payments')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'List customer payment transaction history' })
  async list(@CurrentUser() user: any) {
    return this.billingService.listPayments(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific payment transaction' })
  async get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.billingService.getPayment(user.id, id);
  }
}
