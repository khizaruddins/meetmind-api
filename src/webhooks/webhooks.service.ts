import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { BillingService } from '../billing/billing.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly emailService: EmailService,
  ) {}

  async handleBillingWebhook(rawPayload: any, signature: string) {
    const provider = this.billingService.getProvider();
    const verified = await provider.verifyWebhook(rawPayload, signature);

    const payloadString = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

    // Idempotency check using providerEventId
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { providerEventId: verified.eventId },
    });

    if (existing && existing.processed) {
      this.logger.log(`Webhook event ${verified.eventId} already processed (idempotent skipped)`);
      return { received: true, alreadyProcessed: true };
    }

    const webhookRecord =
      existing ||
      (await this.prisma.webhookEvent.create({
        data: {
          provider: provider.name,
          providerEventId: verified.eventId,
          eventType: verified.type,
          payloadHash,
          processed: false,
        },
      }));

    this.logger.log(`Processing billing webhook event: ${verified.type} (${verified.eventId})`);

    try {
      const data = verified.data;

      switch (verified.type) {
        case 'checkout.session.completed': {
          const userId = data.metadata?.userId || data.client_reference_id;
          const planCode = (data.metadata?.planCode || 'SILVER').toUpperCase();
          if (userId) {
            await this.billingService.changePlan(userId, planCode);
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const customerId = data.customer;
          const paymentCustomer = await this.prisma.paymentCustomer.findFirst({
            where: { providerCustomerId: customerId },
          });
          if (paymentCustomer) {
            const status = (data.status || 'active').toUpperCase();
            await this.prisma.subscription.updateMany({
              where: { userId: paymentCustomer.userId },
              data: {
                status: status === 'ACTIVE' ? 'ACTIVE' : status === 'PAST_DUE' ? 'PAST_DUE' : 'CANCELLED',
                currentPeriodStart: data.current_period_start ? new Date(data.current_period_start * 1000) : undefined,
                currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end * 1000) : undefined,
              },
            });
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const customerId = data.customer;
          const paymentCustomer = await this.prisma.paymentCustomer.findFirst({
            where: { providerCustomerId: customerId },
          });
          if (paymentCustomer) {
            await this.prisma.subscription.updateMany({
              where: { userId: paymentCustomer.userId },
              data: { status: 'CANCELLED', cancelledAt: new Date() },
            });
          }
          break;
        }

        case 'invoice.paid': {
          if (data.id) {
            await this.prisma.invoice.updateMany({
              where: { providerInvoiceId: data.id },
              data: { status: 'PAID' },
            });
          }
          break;
        }

        case 'invoice.payment_failed': {
          const customerId = data.customer;
          const paymentCustomer = await this.prisma.paymentCustomer.findFirst({
            where: { providerCustomerId: customerId },
          });
          if (paymentCustomer) {
            await this.prisma.subscription.updateMany({
              where: { userId: paymentCustomer.userId },
              data: { status: 'PAST_DUE' },
            });
            const user = await this.prisma.user.findUnique({ where: { id: paymentCustomer.userId } });
            if (user) {
              await this.emailService.sendPaymentFailedNotification(
                user.email,
                data.amount_due ? data.amount_due / 100 : 0,
                data.id || 'unknown',
              );
            }
          }
          break;
        }

        case 'payment_intent.succeeded': {
          if (data.id) {
            await this.prisma.payment.updateMany({
              where: { providerPaymentId: data.id },
              data: { status: 'SUCCEEDED' },
            });
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          if (data.id) {
            await this.prisma.payment.updateMany({
              where: { providerPaymentId: data.id },
              data: { status: 'FAILED', failureReason: data.last_payment_error?.message },
            });
          }
          break;
        }

        default:
          this.logger.log(`Unhandled webhook event type: ${verified.type}`);
          break;
      }

      await this.prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: { processed: true, processedAt: new Date() },
      });

      return { received: true, eventId: verified.eventId, type: verified.type };
    } catch (err: any) {
      this.logger.error(`Error processing webhook ${verified.eventId}: ${err.message}`, err.stack);
      throw err;
    }
  }
}
