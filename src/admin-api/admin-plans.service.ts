import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface AdminCreatePlanDto {
  code: string;
  name: string;
  description: string;
  billingInterval?: string;
  priceAmount: number;
  currency?: string;
  trialDays?: number;
  dailyRecordingLimitSeconds?: number;
  active?: boolean;
  sortOrder?: number;
  features?: Record<string, boolean>;
}

export interface AdminUpdatePlanDto {
  name?: string;
  description?: string;
  billingInterval?: string;
  priceAmount?: number;
  currency?: string;
  trialDays?: number;
  dailyRecordingLimitSeconds?: number;
  active?: boolean;
  sortOrder?: number;
}

@Injectable()
export class AdminPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      include: {
        planFeatures: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      plans: plans.map((p) => ({
        ...p,
        subscriberCount: p._count.subscriptions,
        features: p.planFeatures.reduce((acc, f) => {
          acc[f.featureKey] = f.enabled;
          return acc;
        }, {} as Record<string, boolean>),
      })),
    };
  }

  async getPlan(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        planFeatures: true,
        _count: { select: { subscriptions: true } },
      },
    });

    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Plan not found' });
    return {
      ...plan,
      subscriberCount: plan._count.subscriptions,
      features: plan.planFeatures.reduce((acc, f) => {
        acc[f.featureKey] = f.enabled;
        return acc;
      }, {} as Record<string, boolean>),
    };
  }

  async createPlan(dto: AdminCreatePlanDto, adminId: string) {
    const existing = await this.prisma.plan.findUnique({ where: { code: dto.code.toUpperCase() } });
    if (existing) throw new BadRequestException({ code: 'PLAN_CODE_EXISTS', message: 'Plan code already exists' });

    const plan = await this.prisma.plan.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description,
        billingInterval: dto.billingInterval || 'MONTHLY',
        priceAmount: dto.priceAmount || 0,
        currency: dto.currency || 'USD',
        trialDays: dto.trialDays || 0,
        dailyRecordingLimitSeconds: dto.dailyRecordingLimitSeconds || 0,
        active: dto.active !== undefined ? dto.active : true,
        sortOrder: dto.sortOrder || 0,
      },
    });

    if (dto.features) {
      for (const [key, enabled] of Object.entries(dto.features)) {
        await this.prisma.planFeature.create({
          data: {
            planId: plan.id,
            featureKey: key,
            enabled,
          },
        });
      }
    }

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'plan.create',
      entityType: 'PLAN',
      entityId: plan.id,
      metadataJson: { code: plan.code },
    });

    return this.getPlan(plan.id);
  }

  async updatePlan(id: string, dto: AdminUpdatePlanDto, adminId: string) {
    await this.getPlan(id);

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        billingInterval: dto.billingInterval,
        priceAmount: dto.priceAmount,
        currency: dto.currency,
        trialDays: dto.trialDays,
        dailyRecordingLimitSeconds: dto.dailyRecordingLimitSeconds,
        active: dto.active,
        sortOrder: dto.sortOrder,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'plan.update',
      entityType: 'PLAN',
      entityId: id,
      metadataJson: dto as any,
    });

    return this.getPlan(id);
  }

  async deletePlan(id: string, adminId: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });

    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Plan not found' });

    if (plan._count.subscriptions > 0) {
      throw new BadRequestException({
        code: 'PLAN_IN_USE',
        message: `Cannot delete plan ${plan.code} because ${plan._count.subscriptions} subscription(s) actively use it. Deactivate it instead.`,
      });
    }

    await this.prisma.plan.delete({ where: { id } });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'plan.delete',
      entityType: 'PLAN',
      entityId: id,
      metadataJson: { code: plan.code },
    });

    return { success: true, message: 'Plan deleted' };
  }

  async activatePlan(id: string, adminId: string) {
    const updated = await this.prisma.plan.update({ where: { id }, data: { active: true } });
    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'plan.activate',
      entityType: 'PLAN',
      entityId: id,
    });
    return updated;
  }

  async deactivatePlan(id: string, adminId: string) {
    const updated = await this.prisma.plan.update({ where: { id }, data: { active: false } });
    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'plan.deactivate',
      entityType: 'PLAN',
      entityId: id,
    });
    return updated;
  }

  // Section 30: Feature Flags Management
  async listAllFeatures() {
    const features = await this.prisma.permission.findMany({
      where: { key: { startsWith: 'feature.' } },
    });
    return { features };
  }

  async createFeature(key: string, description: string, adminId: string) {
    const featureKey = key.startsWith('feature.') ? key : `feature.${key}`;
    const feature = await this.prisma.permission.create({
      data: { key: featureKey, description },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'feature.create',
      entityType: 'PLAN',
      metadataJson: { key: featureKey },
    });

    return feature;
  }

  async updatePlanFeatures(planId: string, features: Record<string, boolean>, adminId: string) {
    await this.getPlan(planId);

    for (const [key, enabled] of Object.entries(features)) {
      await this.prisma.planFeature.upsert({
        where: { planId_featureKey: { planId, featureKey: key } },
        create: { planId, featureKey: key, enabled },
        update: { enabled },
      });
    }

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'plan.update_features',
      entityType: 'PLAN',
      entityId: planId,
      metadataJson: { features },
    });

    return this.getPlan(planId);
  }
}
