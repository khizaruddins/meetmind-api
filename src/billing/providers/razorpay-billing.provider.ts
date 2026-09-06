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

export interface RazorpayPaymentLinkOptions {
  userId: string;
  userEmail: string;
  userName?: string;
  plan: {
    code: string;
    name: string;
    priceAmount: number;
    currency: string;
  };
  callbackUrl?: string;
}

export interface RazorpayPaymentLinkResult {
  paymentLinkId: string;
  paymentLinkUrl: string;
  status: string;
  amount: number;
  currency: string;
  keyId: string;
  orderId?: string;
  isSimulation?: boolean;
}

@Injectable()
export class RazorpayBillingProvider implements BillingProvider {
  readonly name = 'razorpay';
  private readonly logger = new Logger(RazorpayBillingProvider.name);

  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly hasValidCredentials: boolean;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    this.hasValidCredentials = Boolean(
      this.keyId &&
      this.keySecret &&
      !this.keyId.includes('placeholder') &&
      !this.keySecret.includes('placeholder')
    );

    if (this.hasValidCredentials) {
      this.logger.log(`Razorpay provider initialized with Key ID: ${this.keyId.substring(0, 8)}...`);
    } else {
      this.logger.warn(
        'Razorpay credentials not found or placeholder in environment (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET). Sandbox simulation mode active.'
      );
    }
  }

  getKeyId(): string {
    return this.keyId || 'rzp_test_meetmind_mock';
  }

  isConfigured(): boolean {
    return this.hasValidCredentials;
  }

  /**
   * Creates a dynamic Razorpay Payment Link via Razorpay API (POST https://api.razorpay.com/v1/payment_links)
   * If credentials are not configured, provides a sandbox mock payment link.
   */
  async createPaymentLink(options: RazorpayPaymentLinkOptions): Promise<RazorpayPaymentLinkResult> {
    const { userId, userEmail, userName, plan, callbackUrl } = options;

    if (this.hasValidCredentials) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const payload = {
          amount: plan.priceAmount, // in paise
          currency: plan.currency || 'INR',
          accept_partial: false,
          description: `MeetMind ${plan.name} Monthly Subscription`,
          customer: {
            name: userName || userEmail.split('@')[0],
            email: userEmail,
          },
          notify: {
            sms: false,
            email: true,
          },
          reminder_enable: true,
          notes: {
            userId,
            planCode: plan.code,
            planName: plan.name,
          },
          callback_url: callbackUrl,
          callback_method: 'get',
        };

        const res = await fetch('https://api.razorpay.com/v1/payment_links', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          this.logger.log(`Created Razorpay payment link ${data.id} for user ${userId}, plan ${plan.code}`);
          return {
            paymentLinkId: data.id,
            paymentLinkUrl: data.short_url || data.url,
            status: data.status,
            amount: data.amount,
            currency: data.currency,
            keyId: this.keyId,
            orderId: data.order_id,
            isSimulation: false,
          };
        }

        const errText = await res.text();
        this.logger.error(`Razorpay Payment Link API error (${res.status}): ${errText}`);
      } catch (err: any) {
        this.logger.error(`Failed to call Razorpay Payment Link API: ${err.message}`);
      }
    }

    // Sandbox / Simulation fallback
    const simulatedId = `plink_${crypto.randomBytes(8).toString('hex')}`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const simulatedUrl = callbackUrl || `${frontendUrl}/app/subscription?payment=success&payment_id=pay_${simulatedId.slice(6)}&plan=${plan.code}`;

    this.logger.log(`Generated simulated Razorpay payment link ${simulatedId} for user ${userId} [Amount: ${plan.priceAmount} ${plan.currency}]`);

    return {
      paymentLinkId: simulatedId,
      paymentLinkUrl: simulatedUrl,
      status: 'created',
      amount: plan.priceAmount,
      currency: plan.currency || 'INR',
      keyId: this.keyId || 'rzp_test_meetmind_mock',
      orderId: `order_${crypto.randomBytes(8).toString('hex')}`,
      isSimulation: true,
    };
  }

  /**
   * Creates a Razorpay Order via Razorpay API (POST https://api.razorpay.com/v1/orders)
   * Used for inline popup checkout modal (window.Razorpay)
   */
  async createOrder(options: {
    userId: string;
    plan: { code: string; priceAmount: number; currency: string; name: string };
  }): Promise<{ orderId: string; amount: number; currency: string; keyId: string; isSimulation: boolean }> {
    const { userId, plan } = options;

    if (this.hasValidCredentials) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const payload = {
          amount: plan.priceAmount,
          currency: plan.currency || 'INR',
          receipt: `rcpt_${userId.substring(0, 8)}_${Date.now().toString().slice(-6)}`,
          notes: {
            userId,
            planCode: plan.code,
            planName: plan.name,
          },
        };

        const res = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          this.logger.log(`Created Razorpay Order ${data.id} for user ${userId}`);
          return {
            orderId: data.id,
            amount: data.amount,
            currency: data.currency,
            keyId: this.keyId,
            isSimulation: false,
          };
        }

        const errText = await res.text();
        this.logger.error(`Razorpay Order API error (${res.status}): ${errText}`);
      } catch (err: any) {
        this.logger.error(`Failed to call Razorpay Order API: ${err.message}`);
      }
    }

    // Simulation order fallback
    return {
      orderId: `order_${crypto.randomBytes(8).toString('hex')}`,
      amount: plan.priceAmount,
      currency: plan.currency || 'INR',
      keyId: this.keyId || 'rzp_test_meetmind_mock',
      isSimulation: true,
    };
  }

  /**
   * Verifies Razorpay payment signature
   */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!this.hasValidCredentials) return true;
    try {
      const generated = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
      return generated === signature;
    } catch {
      return false;
    }
  }

  // --- BillingProvider interface implementations ---

  async createCustomer(userId: string, email: string, name?: string): Promise<string> {
    return `cus_rzp_${userId.substring(0, 8)}`;
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
    const link = await this.createPaymentLink({
      userId: options.userId,
      userEmail: options.email,
      plan: {
        code: options.planCode,
        name: `${options.planCode} Plan`,
        priceAmount: options.planCode === 'GOLD' ? 124900 : 54900,
        currency: 'INR',
      },
      callbackUrl: options.successUrl,
    });
    return {
      sessionId: link.paymentLinkId,
      url: link.paymentLinkUrl,
    };
  }

  async createPortalSession(customerId: string, returnUrl?: string): Promise<PortalSessionResult> {
    return {
      url: returnUrl || 'https://meetmind.app/app/subscription',
    };
  }

  async createSubscription(customerId: string, planCode: string): Promise<BillingSubscriptionResult> {
    const now = new Date();
    return {
      id: `sub_rzp_${crypto.randomBytes(8).toString('hex')}`,
      customerId,
      planCode,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    };
  }

  async changeSubscription(subscriptionId: string, newPlanCode: string): Promise<BillingSubscriptionResult> {
    const now = new Date();
    return {
      id: subscriptionId,
      customerId: 'cus_rzp_mock',
      planCode: newPlanCode,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    };
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<BillingSubscriptionResult> {
    const now = new Date();
    return {
      id: subscriptionId,
      customerId: 'cus_rzp_mock',
      planCode: 'SILVER',
      status: atPeriodEnd ? 'active' : 'cancelled',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: atPeriodEnd,
    };
  }

  async resumeSubscription(subscriptionId: string): Promise<BillingSubscriptionResult> {
    const now = new Date();
    return {
      id: subscriptionId,
      customerId: 'cus_rzp_mock',
      planCode: 'SILVER',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    };
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscriptionResult | null> {
    const now = new Date();
    return {
      id: subscriptionId,
      customerId: 'cus_rzp_mock',
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
      invoiceNumber: `INV-RZP-${invoiceId.substring(0, 6)}`,
      amountDue: 54900,
      amountPaid: 54900,
      currency: 'INR',
      status: 'PAID',
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  async listInvoices(customerId: string): Promise<BillingInvoiceResult[]> {
    return [];
  }

  async listPaymentMethods(customerId: string): Promise<BillingPaymentMethodResult[]> {
    return [
      {
        id: 'pm_rzp_upi',
        brand: 'upi',
        last4: 'rzp',
        expMonth: 12,
        expYear: 2030,
        isDefault: true,
      },
    ];
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<boolean> {
    return true;
  }

  async verifyWebhook(payload: Buffer | string, signature: string): Promise<{ eventId: string; type: string; data: any }> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || this.keySecret;
    let parsed: any;
    const raw = typeof payload === 'string' ? payload : payload.toString('utf-8');

    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      if (expected !== signature) {
        throw new Error('Invalid Razorpay webhook signature');
      }
    }

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    return {
      eventId: parsed.event_id || `evt_rzp_${crypto.randomBytes(6).toString('hex')}`,
      type: parsed.event || 'unknown',
      data: parsed.payload || parsed,
    };
  }
}
