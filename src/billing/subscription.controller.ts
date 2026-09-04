import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Subscriptions')
@Controller('v1/subscription')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @ApiOperation({ summary: 'Get current customer subscription and trial status' })
  async getSubscription(@CurrentUser() user: any) {
    return this.billingService.getSubscription(user.id);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Create checkout session for plan upgrade' })
  async checkout(
    @CurrentUser() user: any,
    @Body('planCode') planCode: string,
    @Body('successUrl') successUrl?: string,
    @Body('cancelUrl') cancelUrl?: string,
  ) {
    return this.billingService.createCheckoutSession(user.id, planCode, successUrl, cancelUrl);
  }

  @Post('change-plan/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview proration, effective date, and amount due before plan change' })
  async previewChangePlan(
    @CurrentUser() user: any,
    @Body('targetPlan') targetPlan?: string,
    @Body('planCode') planCode?: string,
  ) {
    const plan = targetPlan || planCode;
    return this.billingService.previewPlanChange(user.id, plan);
  }

  @Post('change-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Immediately upgrade or downgrade customer subscription plan' })
  async changePlan(
    @CurrentUser() user: any,
    @Body('planCode') planCode?: string,
    @Body('targetPlan') targetPlan?: string,
  ) {
    const plan = planCode || targetPlan;
    return this.billingService.changePlan(user.id, plan);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription (effective at end of billing cycle)' })
  async cancel(@CurrentUser() user: any, @Body('atPeriodEnd') atPeriodEnd?: boolean) {
    return this.billingService.cancelSubscription(user.id, atPeriodEnd ?? true);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a subscription scheduled for cancellation' })
  async resume(@CurrentUser() user: any) {
    return this.billingService.resumeSubscription(user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get subscription state change history' })
  async history(@CurrentUser() user: any) {
    return this.billingService.getSubscriptionHistory(user.id);
  }

  @Get('upcoming-invoice')
  @ApiOperation({ summary: 'Get preview of next upcoming invoice' })
  async upcomingInvoice(@CurrentUser() user: any) {
    return this.billingService.getUpcomingInvoice(user.id);
  }

  @Post('customer-portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate provider-hosted customer billing portal session URL' })
  async customerPortal(@CurrentUser() user: any, @Body('returnUrl') returnUrl?: string) {
    return this.billingService.createCustomerPortalSession(user.id, returnUrl);
  }
}
