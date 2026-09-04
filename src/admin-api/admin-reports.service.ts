import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubscriptionsReport() {
    const subs = await this.prisma.subscription.findMany({
      include: {
        plan: true,
        user: { select: { email: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return subs.map((s) => ({
      subscriptionId: s.id,
      userEmail: s.user.email,
      userName: s.user.displayName,
      plan: s.plan.code,
      status: s.status,
      periodStart: s.currentPeriodStart.toISOString(),
      periodEnd: s.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      cancelledAt: s.cancelledAt?.toISOString() || null,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async getRevenueReport() {
    const payments = await this.prisma.payment.findMany({
      include: {
        user: { select: { email: true } },
        subscription: { include: { plan: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p) => ({
      paymentId: p.id,
      userEmail: p.user.email,
      amount: p.amount / 100,
      currency: p.currency,
      status: p.status,
      plan: p.subscription?.plan?.code || 'N/A',
      date: p.createdAt.toISOString(),
    }));
  }

  async getUsageReport() {
    const usages = await this.prisma.dailyUsage.findMany({
      include: {
        user: { select: { email: true } },
      },
      orderBy: { usageDate: 'desc' },
    });

    return usages.map((u) => ({
      date: u.usageDate,
      userEmail: u.user.email,
      recordingSeconds: u.recordingSeconds,
      recordingMinutes: Math.round((u.recordingSeconds / 60) * 10) / 10,
      recordingCount: u.recordingCount,
    }));
  }

  async getTrialsReport() {
    const trials = await this.prisma.trial.findMany({
      include: {
        user: { select: { email: true, displayName: true } },
      },
      orderBy: { startedAt: 'desc' },
    });

    const now = new Date();
    return trials.map((t) => ({
      trialId: t.id,
      userEmail: t.user.email,
      userName: t.user.displayName,
      startedAt: t.startedAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      daysRemaining: Math.max(0, Math.ceil((t.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
      status: t.status,
      extendedDays: t.extendedDays,
    }));
  }

  async getRecordingsReport() {
    const recordings = await this.prisma.recordingSession.findMany({
      include: {
        user: { select: { email: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 500,
    });

    return recordings.map((r) => ({
      recordingId: r.id,
      userEmail: r.user.email,
      meetingTitle: r.meetingTitle,
      meetingPlatform: r.meetingPlatform,
      durationSeconds: r.durationSeconds,
      durationMinutes: Math.round((r.durationSeconds / 60) * 10) / 10,
      status: r.status,
      plan: r.authorizationType,
      autoStarted: r.autoStarted,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() || null,
    }));
  }

  toCsv(data: Record<string, any>[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers
        .map((h) => {
          const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }
}
