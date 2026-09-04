import { Body, Controller, ForbiddenException, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { Request } from 'express';

@ApiTags('Webhooks')
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('billing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive and process provider billing webhooks with signature verification and idempotency' })
  async handleBillingWebhook(
    @Body() payload: any,
    @Headers('stripe-signature') stripeSignature?: string,
    @Headers('x-webhook-signature') customSignature?: string,
    @Req() req?: Request,
  ) {
    const signature = stripeSignature || customSignature || 'dev_signature';
    return this.webhooksService.handleBillingWebhook(payload, signature);
  }

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive and process Stripe billing webhooks' })
  async handleStripeWebhook(
    @Body() payload: any,
    @Headers('stripe-signature') stripeSignature?: string,
    @Req() req?: Request,
  ) {
    const signature = stripeSignature || 'stripe_signature';
    return this.webhooksService.handleBillingWebhook(payload, signature);
  }

  @Post('simulator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate billing webhooks for local/test environments' })
  async handleSimulatorWebhook(
    @Body() payload: any,
    @Headers('x-webhook-signature') customSignature?: string,
    @Req() req?: Request,
  ) {
    if (process.env.ENABLE_BILLING_SIMULATOR === 'false' || process.env.NODE_ENV === 'production') {
      throw new ForbiddenException({
        code: 'SIMULATOR_DISABLED',
        message: 'Billing simulator is disabled in production or explicitly disabled via ENABLE_BILLING_SIMULATOR=false',
      });
    }
    const signature = customSignature || 'dev_signature';
    return this.webhooksService.handleBillingWebhook(payload, signature);
  }
}
