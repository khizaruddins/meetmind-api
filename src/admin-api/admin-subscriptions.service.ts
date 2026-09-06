import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listSubscriptions(query: PaginationQueryDto & { plan?: string; status?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.plan) where.plan = { code: query.plan.toUpperCase() };

    const [total, items] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: {
          plan: true,
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return paginate(items, total, page, limit);
  }

  async getSubscription(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        user: { select: { id: true, email: true, displayName: true } },
        histories: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!sub) throw new NotFoundException({ code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found' });
    return sub;
  }

  async createSubscription(data: { userId: string; planCode: string }, adminId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code: data.planCode.toUpperCase() } });
    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: `Plan ${data.planCode} not found` });

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const sub = await this.prisma.subscription.create({
      data: {
        userId: data.userId,
        planId: plan.id,
        provider: 'dev',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      include: { plan: true },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'subscription.create',
      entityType: 'SUBSCRIPTION',
      entityId: sub.id,
      metadataJson: { planCode: plan.code, userId: data.userId },
    });

    return sub;
  }

  async updateSubscription(id: string, data: any, adminId: string) {
    const sub = await this.getSubscription(id);
    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        status: data.status,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        currentPeriodEnd: data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : undefined,
      },
      include: { plan: true },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'subscription.update',
      entityType: 'SUBSCRIPTION',
      entityId: id,
      metadataJson: data,
    });

    return updated;
  }

  async changePlan(id: string, newPlanCode: string, reason: string | undefined, adminId: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A mandatory reason must be provided for administrative subscription mutations',
      });
    }

    const sub = await this.getSubscription(id);
    const plan = await this.prisma.plan.findUnique({ where: { code: newPlanCode.toUpperCase() } });
    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: `Plan ${newPlanCode} not found` });

    const oldPlanId = sub.planId;
    const oldStatus = sub.status;

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        planId: plan.id,
        status: 'ACTIVE',
      },
      include: { plan: true },
    });

    if (plan.code === 'TRIAL') {
      const trialDays = plan.trialDays || 30;
      const expiresAt = new Date(Date.now() + trialDays * 86400 * 1000);
      await this.prisma.trial.upsert({
        where: { userId: sub.userId },
        create: {
          userId: sub.userId,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt,
        },
        update: {
          status: 'ACTIVE',
          expiresAt,
        },
      });
    }

    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: id,
        oldPlanId,
        newPlanId: plan.id,
        oldStatus,
        newStatus: 'ACTIVE',
        reason: reason.trim(),
        changedBy: `admin:${adminId}`,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'subscription.change_plan',
      entityType: 'SUBSCRIPTION',
      entityId: id,
      metadataJson: { oldPlan: sub.plan.code, newPlan: plan.code, reason: reason.trim() },
    });

    return { success: true, subscription: updated, ...updated };
  }

  async cancelSubscription(id: string, reason: string | undefined, adminId: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A mandatory reason must be provided for administrative subscription mutations',
      });
    }

    const sub = await this.getSubscription(id);
    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: id,
        oldPlanId: sub.planId,
        newPlanId: sub.planId,
        oldStatus: sub.status,
        newStatus: 'CANCELLED',
        reason: reason.trim(),
        changedBy: `admin:${adminId}`,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'subscription.cancel',
      entityType: 'SUBSCRIPTION',
      entityId: id,
      metadataJson: { reason: reason.trim() },
    });

    return { success: true, subscription: updated, ...updated };
  }

  async resumeSubscription(id: string, reason: string | undefined, adminId: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A mandatory reason must be provided for administrative subscription mutations',
      });
    }

    const sub = await this.getSubscription(id);
    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: 'ACTIVE', cancelledAt: null, cancelAtPeriodEnd: false },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: id,
        oldPlanId: sub.planId,
        newPlanId: sub.planId,
        oldStatus: sub.status,
        newStatus: 'ACTIVE',
        reason: reason.trim(),
        changedBy: `admin:${adminId}`,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'subscription.resume',
      entityType: 'SUBSCRIPTION',
      entityId: id,
      metadataJson: { reason: reason.trim() },
    });

    return { success: true, subscription: updated, ...updated };
  }

  async extendSubscription(id: string, days: number, reason: string | undefined, adminId: string) {
    if (!days || days <= 0) {
      throw new BadRequestException({
        code: 'INVALID_DAYS',
        message: 'Extension days must be a positive integer',
      });
    }

    if (!reason || !reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A mandatory reason must be provided for administrative subscription mutations',
      });
    }

    const sub = await this.getSubscription(id);
    const currentEnd = sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd.getTime() : Date.now();
    const newEnd = new Date(currentEnd + (days || 30) * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { currentPeriodEnd: newEnd, status: 'ACTIVE' },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: id,
        oldPlanId: sub.planId,
        newPlanId: sub.planId,
        oldStatus: sub.status,
        newStatus: 'ACTIVE',
        reason: reason.trim(),
        changedBy: `admin:${adminId}`,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'subscription.extend',
      entityType: 'SUBSCRIPTION',
      entityId: id,
      metadataJson: { days, newEnd, reason: reason.trim() },
    });

    return { success: true, subscription: updated, ...updated };
  }

  async overrideStatus(id: string, status: string, reason: string, adminId: string) {
    if (!status || !status.trim()) {
      throw new BadRequestException({
        code: 'STATUS_REQUIRED',
        message: 'Status is required',
      });
    }

    if (!reason || !reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'A mandatory reason must be provided for administrative subscription mutations',
      });
    }

    const sub = await this.getSubscription(id);
    const oldStatus = sub.status;

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: id,
        oldPlanId: sub.planId,
        newPlanId: sub.planId,
        oldStatus,
        newStatus: status,
        reason: `Override: ${reason.trim()}`,
        changedBy: `admin:${adminId}`,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'subscription.override_status',
      entityType: 'SUBSCRIPTION',
      entityId: id,
      metadataJson: { oldStatus, newStatus: status, reason: reason.trim() },
    });

    return { success: true, subscription: updated, ...updated };
  }

  // Section 33: Subscription & Revenue Metrics
  async getMetrics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeSubs, newThisMonth, cancelledSubs, pastDueSubs, allPaidPayments, totalUsers, totalPaidUsers] =
      await Promise.all([
        this.prisma.subscription.findMany({
          where: { status: 'ACTIVE' },
          include: { plan: true },
        }),
        this.prisma.subscription.count({
          where: { createdAt: { gte: startOfMonth } },
        }),
        this.prisma.subscription.count({
          where: { status: 'CANCELLED' },
        }),
        this.prisma.subscription.count({
          where: { status: 'PAST_DUE' },
        }),
        this.prisma.payment.findMany({
          where: { status: 'FAILED' },
        }),
        this.prisma.user.count(),
        this.prisma.subscription.count({
          where: {
            status: 'ACTIVE',
            plan: { code: { in: ['SILVER', 'GOLD'] } },
          },
        }),
      ]);

    let mrrCents = 0;
    let silverCount = 0;
    let goldCount = 0;

    for (const sub of activeSubs) {
      if (sub.plan.code === 'SILVER') {
        silverCount++;
        mrrCents += sub.plan.priceAmount;
      } else if (sub.plan.code === 'GOLD') {
        goldCount++;
        mrrCents += sub.plan.priceAmount;
      }
    }

    const mrr = mrrCents / 100;
    const arr = mrr * 12;
    const trialConversion = totalUsers > 0 ? Math.round((totalPaidUsers / totalUsers) * 1000) / 10 : 0;

    return {
      mrr,
      arr,
      activeSubscriptions: activeSubs.length,
      newSubscriptionsThisMonth: newThisMonth,
      cancellations: cancelledSubs,
      failedPayments: allPaidPayments.length,
      pastDue: pastDueSubs,
      silverCount,
      goldCount,
      trialConversionRatePercent: trialConversion,
    };
  }
}
