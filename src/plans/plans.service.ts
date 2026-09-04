import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomerPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      include: {
        planFeatures: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      plans: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        billingInterval: p.billingInterval,
        priceAmount: p.priceAmount,
        currency: p.currency,
        trialDays: p.trialDays,
        dailyRecordingLimitSeconds: p.dailyRecordingLimitSeconds,
        features: p.planFeatures.reduce((acc, f) => {
          acc[f.featureKey] = f.enabled;
          return acc;
        }, {} as Record<string, boolean>),
      })),
    };
  }

  async getCustomerPlanByCode(code: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        planFeatures: true,
      },
    });

    if (!plan || !plan.active) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: `Plan ${code} not found` });
    }

    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      billingInterval: plan.billingInterval,
      priceAmount: plan.priceAmount,
      currency: plan.currency,
      trialDays: plan.trialDays,
      dailyRecordingLimitSeconds: plan.dailyRecordingLimitSeconds,
      features: plan.planFeatures.reduce((acc, f) => {
        acc[f.featureKey] = f.enabled;
        return acc;
      }, {} as Record<string, boolean>),
    };
  }
}
