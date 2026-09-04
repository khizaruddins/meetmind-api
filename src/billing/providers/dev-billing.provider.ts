import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  BillingInvoiceResult,
  BillingPaymentMethodResult,
  BillingProvider,
  BillingSubscriptionResult,
  CheckoutSessionOptions,
  CheckoutSessionResult,
  PortalSessionResult,
} from '../interfaces/billing-provider.interface';

@Injectable()
export class DevBillingProvider implements BillingProvider {
  readonly name = 'dev';
  private readonly logger = new Logger(DevBillingProvider.name);

  async createCustomer(userId: string, email: string, name?: string): Promise<string> {
    const customerId = `cus_dev_${userId.substring(0, 8)}`;
    this.logger.log(`Created Dev customer ${customerId} for ${email}`);
    return customerId;
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
    const sessionId = `cs_dev_${crypto.randomBytes(8).toString('hex')}`;
    const url = `http://localhost:3001/checkout/mock?sessionId=${sessionId}&plan=${options.planCode}&userId=${options.userId}`;
    return { sessionId, url };
  }

  async createPortalSession(customerId: string, returnUrl?: string): Promise<PortalSessionResult> {
    return {
      url: returnUrl || `http://localhost:3001/portal/mock?customer=${customerId}`,
    };
  }

  async createSubscription(customerId: string, planCode: string): Promise<BillingSubscriptionResult> {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      id: `sub_dev_${crypto.randomBytes(8).toString('hex')}`,
      customerId,
      planCode,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    };
  }

  async changeSubscription(subscriptionId: string, newPlanCode: string): Promise<BillingSubscriptionResult> {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      id: subscriptionId,
      customerId: 'cus_dev_mock',
      planCode: newPlanCode,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    };
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<BillingSubscriptionResult> {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      id: subscriptionId,
      customerId: 'cus_dev_mock',
      planCode: 'SILVER',
      status: atPeriodEnd ? 'active' : 'cancelled',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: atPeriodEnd,
    };
  }

  async resumeSubscription(subscriptionId: string): Promise<BillingSubscriptionResult> {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      id: subscriptionId,
      customerId: 'cus_dev_mock',
      planCode: 'SILVER',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    };
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscriptionResult | null> {
    const now = new Date();
    return {
      id: subscriptionId,
      customerId: 'cus_dev_mock',
      planCode: 'SILVER',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    };
  }

  async getInvoice(invoiceId: string): Promise<BillingInvoiceResult | null> {
    const now = new Date();
    return {
      id: invoiceId,
      invoiceNumber: `INV-DEV-${invoiceId.substring(0, 6)}`,
      amountDue: 1900,
      amountPaid: 1900,
      currency: 'USD',
      status: 'PAID',
      invoiceUrl: `https://invoices.dev/${invoiceId}`,
      invoicePdfUrl: `https://invoices.dev/${invoiceId}/pdf`,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  async listInvoices(customerId: string): Promise<BillingInvoiceResult[]> {
    const now = new Date();
    return [
      {
        id: 'in_dev_mock1',
        invoiceNumber: 'INV-DEV-001',
        amountDue: 1900,
        amountPaid: 1900,
        currency: 'USD',
        status: 'PAID',
        invoiceUrl: 'https://invoices.dev/mock1',
        invoicePdfUrl: 'https://invoices.dev/mock1/pdf',
        periodStart: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: now,
      },
    ];
  }

  async listPaymentMethods(customerId: string): Promise<BillingPaymentMethodResult[]> {
    return [
      {
        id: 'pm_dev_mock1',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
        isDefault: true,
      },
    ];
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<boolean> {
    return true;
  }

  async verifyWebhook(payload: any, signature: string): Promise<{ eventId: string; type: string; data: any }> {
    let parsed: any;
    if (typeof payload === 'object' && !Buffer.isBuffer(payload)) {
      parsed = payload;
    } else {
      const raw = typeof payload === 'string' ? payload : payload.toString('utf-8');
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    }
    return {
      eventId: parsed.id || `evt_dev_${crypto.randomBytes(6).toString('hex')}`,
      type: parsed.type || 'unknown',
      data: parsed.data?.object || parsed.data || {},
    };
  }
}
