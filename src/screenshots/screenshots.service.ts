import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import {
  buildCountQuota,
  getDailyScreenshotLimit,
  normalizePlanCode,
} from '../common/plan-limits';

@Injectable()
export class ScreenshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async getDailyQuota(userId: string) {
    const entitlements = await this.entitlementsService.getEntitlements(userId);
    const plan = normalizePlanCode(entitlements.plan);
    const dailyLimit = getDailyScreenshotLimit(plan);
    const todayStr = this.entitlementsService.getTodayUtcString();
    const daily = await this.prisma.dailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate: todayStr,
        },
      },
    });

    const usedToday = daily?.screenshotCount || 0;
    const planAllows =
      plan !== 'trial' || Boolean(entitlements.trial && entitlements.trial.active);
    const quota = buildCountQuota(dailyLimit, usedToday, planAllows);

    return {
      today: todayStr,
      plan,
      ...quota,
    };
  }

  async authorizeAndConsume(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        trial: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    if (user.status === 'DISABLED' || user.deletedAt) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: 'User account is disabled',
      });
    }

    const now = new Date();
    const activeSub = user.subscriptions[0];
    const isPaid =
      activeSub && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');

    let plan = 'trial';
    if (isPaid) {
      plan = activeSub.plan.code.toLowerCase();
    } else {
      const trial = user.trial;
      if (!trial || trial.status !== 'ACTIVE' || trial.expiresAt < now) {
        throw new ForbiddenException({
          code: 'TRIAL_EXPIRED',
          message:
            'Your 30-day trial has expired. Upgrade to Silver or Gold to continue taking screenshots.',
        });
      }
    }

    const dailyLimit = getDailyScreenshotLimit(plan);
    const todayStr = this.entitlementsService.getTodayUtcString();

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dailyUsage.findUnique({
        where: {
          userId_usageDate: {
            userId,
            usageDate: todayStr,
          },
        },
      });

      const usedToday = existing?.screenshotCount || 0;
      if (usedToday >= dailyLimit) {
        return { exceeded: true as const, usedToday, remainingToday: 0 };
      }

      const updated = existing
        ? await tx.dailyUsage.update({
            where: { id: existing.id },
            data: { screenshotCount: { increment: 1 } },
          })
        : await tx.dailyUsage.create({
            data: {
              userId,
              usageDate: todayStr,
              screenshotCount: 1,
            },
          });

      return {
        exceeded: false as const,
        usedToday: updated.screenshotCount,
        remainingToday: Math.max(0, dailyLimit - updated.screenshotCount),
      };
    });

    if (result.exceeded) {
      throw new HttpException(
        {
          code: 'SCREENSHOT_QUOTA_EXCEEDED',
          message: `Daily screenshot limit (${dailyLimit}) reached for the ${plan} plan.`,
          dailyLimit,
          usedToday: result.usedToday,
          remainingToday: 0,
          plan,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      authorized: true,
      today: todayStr,
      plan,
      dailyLimit,
      usedToday: result.usedToday,
      remainingToday: result.remainingToday,
    };
  }
}
