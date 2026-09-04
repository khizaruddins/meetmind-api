import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DevBillingProvider } from './providers/dev-billing.provider';
import { StripeBillingProvider } from './providers/stripe-billing.provider';
import { BillingProvider } from './interfaces/billing-provider.interface';
import { EmailService } from '../email/email.service';

@Injectable()
export class BillingService {
  private provider: BillingProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly devProvider: DevBillingProvider,
    private readonly stripeProvider: StripeBillingProvider,
    private readonly emailService: EmailService,
  ) {
    this.provider = process.env.NODE_ENV === 'production' ? this.stripeProvider : this.devProvider;
  }

  getProvider(): BillingProvider {
    return this.provider;
  }

  async getSubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { trial: true },
    });

    return {
      subscription: sub,
      trial: user?.trial,
    };
  }

  async createCheckoutSession(userId: string, planCode: string, successUrl?: string, cancelUrl?: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: planCode.toUpperCase() },
    });
    if (!plan || plan.code === 'TRIAL') {
      throw new BadRequestException({ code: 'INVALID_PLAN', message: 'Can only checkout paid plans (SILVER or GOLD)' });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    return this.provider.createCheckoutSession({
      userId,
      email: user.email,
      planCode: plan.code,
      successUrl,
      cancelUrl,
    });
  }

  async previewPlanChange(userId: string, targetPlanCode: string) {
    if (!targetPlanCode) {
      throw new BadRequestException({ code: 'INVALID_TARGET_PLAN', message: 'Target plan is required' });
    }

    const targetPlan = await this.prisma.plan.findUnique({
      where: { code: targetPlanCode.toUpperCase() },
    });

    if (!targetPlan) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: `Plan ${targetPlanCode} not found` });
    }

    const currentSub = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const renewalDate =
      currentSub?.currentPeriodEnd && currentSub.currentPeriodEnd > now
        ? currentSub.currentPeriodEnd
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const currentPrice = currentSub?.plan?.priceAmount || 0;
    const targetPrice = targetPlan.priceAmount || 0;
    const diff = Math.max(0, targetPrice - currentPrice);

    return {
      currentPlan: currentSub
        ? {
            code: currentSub.plan.code,
            name: currentSub.plan.name,
            priceAmount: currentSub.plan.priceAmount,
            currency: currentSub.plan.currency,
          }
        : {
            code: 'TRIAL',
            name: 'Free Trial',
            priceAmount: 0,
            currency: 'USD',
          },
      targetPlan: {
        code: targetPlan.code,
        name: targetPlan.name,
        priceAmount: targetPlan.priceAmount,
        currency: targetPlan.currency,
      },
      effectiveDate: now,
      estimatedProration: diff,
      estimatedAmountDue: diff,
      newPriceAmount: targetPlan.priceAmount,
      nextRenewalDate: renewalDate,
      currency: targetPlan.currency || 'USD',
    };
  }

  async changePlan(userId: string, newPlanCode: string) {
    const targetPlan = await this.prisma.plan.findUnique({
      where: { code: newPlanCode.toUpperCase() },
    });

    if (!targetPlan) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: `Plan ${newPlanCode} not found` });
    }

    const currentSub = await this.prisma.subscription.findFirst({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let updatedSub;
    if (currentSub) {
      const oldPlanId = currentSub.planId;
      const oldStatus = currentSub.status;

      updatedSub = await this.prisma.subscription.update({
        where: { id: currentSub.id },
        data: {
          planId: targetPlan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
        include: { plan: true },
      });

      await this.prisma.subscriptionHistory.create({
        data: {
          subscriptionId: currentSub.id,
          oldPlanId,
          newPlanId: targetPlan.id,
          oldStatus,
          newStatus: 'ACTIVE',
          reason: `Plan changed to ${targetPlan.code}`,
          changedBy: `user:${userId}`,
        },
      });
    } else {
      updatedSub = await this.prisma.subscription.create({
        data: {
          userId,
          planId: targetPlan.id,
          provider: this.provider.name,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        include: { plan: true },
      });
    }

    // In dev mode, generate a paid invoice and payment record for traceability
    if (targetPlan.priceAmount > 0) {
      const invoiceNumber = `INV-${newPlanCode}-${Date.now().toString().slice(-6)}`;
      const invoice = await this.prisma.invoice.create({
        data: {
          userId,
          subscriptionId: updatedSub.id,
          invoiceNumber,
          amountDue: targetPlan.priceAmount,
          amountPaid: targetPlan.priceAmount,
          currency: targetPlan.currency,
          status: 'PAID',
          invoiceUrl: `https://invoices.meetingrecorder.com/${invoiceNumber}`,
          invoicePdfUrl: `https://invoices.meetingrecorder.com/${invoiceNumber}.pdf`,
          periodStart: now,
          periodEnd,
        },
      });

      await this.prisma.payment.create({
        data: {
          userId,
          subscriptionId: updatedSub.id,
          amount: targetPlan.priceAmount,
          currency: targetPlan.currency,
          status: 'SUCCEEDED',
        },
      });
    }

    return updatedSub;
  }

  async cancelSubscription(userId: string, atPeriodEnd: boolean = true) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) {
      throw new BadRequestException({ code: 'NO_ACTIVE_SUBSCRIPTION', message: 'No active subscription found to cancel' });
    }

    const now = new Date();
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: atPeriodEnd,
        cancelledAt: now,
        status: atPeriodEnd ? 'ACTIVE' : 'CANCELLED',
      },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: sub.id,
        oldPlanId: sub.planId,
        newPlanId: sub.planId,
        oldStatus: sub.status,
        newStatus: updated.status,
        reason: atPeriodEnd ? 'Cancelled at period end' : 'Cancelled immediately',
        changedBy: `user:${userId}`,
      },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.emailService.sendSubscriptionCancelledConfirmation(user.email, updated.currentPeriodEnd);
    }

    return updated;
  }

  async resumeSubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, cancelAtPeriodEnd: true },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) {
      throw new BadRequestException({ code: 'NO_CANCELLATION_PENDING', message: 'No pending subscription cancellation to resume' });
    }

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: sub.id,
        oldPlanId: sub.planId,
        newPlanId: sub.planId,
        oldStatus: sub.status,
        newStatus: 'ACTIVE',
        reason: 'Resumed cancelled subscription',
        changedBy: `user:${userId}`,
      },
    });

    return updated;
  }

  async getSubscriptionHistory(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return { history: [] };

    const history = await this.prisma.subscriptionHistory.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { createdAt: 'desc' },
    });

    return { history };
  }

  async getUpcomingInvoice(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub || sub.plan.priceAmount === 0) {
      return { upcomingInvoice: null };
    }

    return {
      upcomingInvoice: {
        amountDue: sub.plan.priceAmount,
        currency: sub.plan.currency,
        date: sub.currentPeriodEnd,
        planName: sub.plan.name,
      },
    };
  }

  async createCustomerPortalSession(userId: string, returnUrl?: string) {
    let customer = await this.prisma.paymentCustomer.findUnique({ where: { userId } });
    if (!customer) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const customerId = await this.provider.createCustomer(userId, user?.email || '', user?.displayName || '');
      customer = await this.prisma.paymentCustomer.create({
        data: { userId, provider: this.provider.name, providerCustomerId: customerId },
      });
    }
    return this.provider.createPortalSession(customer.providerCustomerId, returnUrl);
  }

  // Payments
  async listPayments(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { payments };
  }

  async getPayment(userId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, userId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    return payment;
  }

  // Invoices
  async listInvoices(userId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { invoices };
  }

  async getInvoice(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
    });
    if (!invoice) throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    return invoice;
  }

  // Payment Methods
  async listPaymentMethods(userId: string) {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { paymentMethods };
  }

  async setupPaymentMethod(userId: string) {
    // In dev / test, create a mock payment method
    const pm = await this.prisma.paymentMethod.create({
      data: {
        userId,
        providerPaymentMethodId: `pm_mock_${Date.now().toString().slice(-6)}`,
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
        isDefault: true,
      },
    });
    return pm;
  }

  async setDefaultPaymentMethod(userId: string, paymentMethodId: string) {
    await this.prisma.paymentMethod.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    const updated = await this.prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isDefault: true },
    });

    return updated;
  }

  async deletePaymentMethod(userId: string, paymentMethodId: string) {
    await this.prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });
    return { success: true, message: 'Payment method removed' };
  }
}
