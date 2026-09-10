import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface ExtendTrialDto {
  days: number;
  reason?: string;
}

@Injectable()
export class AdminTrialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getUserTrial(userId: string) {
    const trial = await this.prisma.trial.findUnique({
      where: { userId },
      include: { user: { select: { email: true, displayName: true } } },
    });
    if (!trial) throw new NotFoundException({ code: 'TRIAL_NOT_FOUND', message: 'No trial record for user' });
    return trial;
  }

  async startTrial(userId: string, adminId: string, days = 30) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const trial = await this.prisma.trial.upsert({
      where: { userId },
      create: {
        userId,
        startedAt: now,
        expiresAt,
        status: 'ACTIVE',
        extendedDays: 0,
      },
      update: {
        startedAt: now,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'trial.start',
      entityType: 'TRIAL',
      entityId: trial.id,
      metadataJson: { userId, days, expiresAt },
    });

    return trial;
  }

  async extendTrial(userId: string, dto: ExtendTrialDto, adminId: string) {
    const trial = await this.prisma.trial.findUnique({ where: { userId } });
    if (!trial) throw new NotFoundException({ code: 'TRIAL_NOT_FOUND', message: 'Trial not found for user' });

    const days = dto.days || 7;
    const baseTime = trial.expiresAt > new Date() ? trial.expiresAt.getTime() : Date.now();
    const newExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.trial.update({
      where: { userId },
      data: {
        expiresAt: newExpiresAt,
        status: 'ACTIVE',
        extendedDays: { increment: days },
        extendedByAdminId: adminId,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'trial.extend',
      entityType: 'TRIAL',
      entityId: trial.id,
      metadataJson: { userId, days, reason: dto.reason || 'Admin extension', newExpiresAt },
    });

    return updated;
  }

  async endTrial(userId: string, adminId: string) {
    const trial = await this.prisma.trial.findUnique({ where: { userId } });
    if (!trial) throw new NotFoundException({ code: 'TRIAL_NOT_FOUND', message: 'Trial not found' });

    const updated = await this.prisma.trial.update({
      where: { userId },
      data: {
        status: 'EXPIRED',
        expiresAt: new Date(),
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'trial.end',
      entityType: 'TRIAL',
      entityId: trial.id,
      metadataJson: { userId },
    });

    return updated;
  }

  async resetDailyUsage(userId: string, adminId: string) {
    const todayStr = new Date().toISOString().split('T')[0];
    await this.prisma.dailyUsage.upsert({
      where: { userId_usageDate: { userId, usageDate: todayStr } },
      create: {
        userId,
        usageDate: todayStr,
        recordingSeconds: 0,
        recordingCount: 0,
        screenshotCount: 0,
        aiRequests: 0,
      },
      update: { recordingSeconds: 0, screenshotCount: 0, aiRequests: 0 },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'trial.reset_daily_usage',
      entityType: 'TRIAL',
      entityId: userId,
      metadataJson: { date: todayStr },
    });

    return { success: true, message: `Daily recording usage reset to 0 for ${todayStr}` };
  }
}
