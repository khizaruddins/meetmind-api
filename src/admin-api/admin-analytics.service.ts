import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserGrowthAnalytics(range: 'day' | 'week' | 'month' = 'month') {
    const users = await this.prisma.user.findMany({
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    const groups: Record<string, number> = {};
    for (const u of users) {
      const key =
        range === 'day'
          ? u.createdAt.toISOString().split('T')[0]
          : range === 'month'
            ? u.createdAt.toISOString().substring(0, 7)
            : `Week ${Math.ceil(u.createdAt.getDate() / 7)} of ${u.createdAt.toISOString().substring(0, 7)}`;

      groups[key] = (groups[key] || 0) + 1;
    }

    return {
      range,
      totalUsers: users.length,
      trend: Object.entries(groups).map(([period, count]) => ({ period, newUsers: count })),
    };
  }

  async getSubscriptionAnalytics() {
    const subs = await this.prisma.subscription.findMany({
      include: { plan: true },
    });

    const breakdown: Record<string, number> = { TRIAL: 0, SILVER: 0, GOLD: 0 };
    const statusBreakdown: Record<string, number> = {};

    for (const s of subs) {
      const code = s.plan.code;
      breakdown[code] = (breakdown[code] || 0) + 1;
      statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1;
    }

    return {
      totalSubscriptions: subs.length,
      byPlan: breakdown,
      byStatus: statusBreakdown,
    };
  }

  async getRecordingAnalytics() {
    const sessions = await this.prisma.recordingSession.findMany({
      select: { durationSeconds: true, meetingPlatform: true, startedAt: true, status: true },
    });

    const totalSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    const completedCount = sessions.filter((s) => s.status === 'COMPLETED').length;

    return {
      totalSessions: sessions.length,
      completedSessions: completedCount,
      totalDurationMinutes: Math.round((totalSeconds / 60) * 10) / 10,
      averageDurationMinutes: sessions.length > 0 ? Math.round((totalSeconds / sessions.length / 60) * 10) / 10 : 0,
    };
  }

  async getRevenueAnalytics() {
    const payments = await this.prisma.payment.findMany({
      where: { status: 'SUCCEEDED' },
      select: { amount: true, currency: true, createdAt: true },
    });

    const totalRevenueCents = payments.reduce((acc, p) => acc + p.amount, 0);
    const monthlyRevenue: Record<string, number> = {};

    for (const p of payments) {
      const month = p.createdAt.toISOString().substring(0, 7);
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + p.amount / 100;
    }

    return {
      totalRevenue: totalRevenueCents / 100,
      monthlyRevenue: Object.entries(monthlyRevenue).map(([month, amount]) => ({ month, amount })),
    };
  }

  async getConversionAnalytics() {
    const [totalUsers, trialUsers, silverUsers, goldUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.trial.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE', plan: { code: 'SILVER' } } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE', plan: { code: 'GOLD' } } }),
    ]);

    const paidTotal = silverUsers + goldUsers;
    const conversionRate = totalUsers > 0 ? Math.round((paidTotal / totalUsers) * 1000) / 10 : 0;

    return {
      totalSignups: totalUsers,
      activeTrials: trialUsers,
      silverSubscribers: silverUsers,
      goldSubscribers: goldUsers,
      totalPaidSubscribers: paidTotal,
      conversionRatePercent: conversionRate,
    };
  }

  async getPlatformAnalytics() {
    const [recordingPlatforms, devicePlatforms] = await Promise.all([
      this.prisma.recordingSession.groupBy({
        by: ['meetingPlatform'],
        _count: { id: true },
      }),
      this.prisma.device.groupBy({
        by: ['platform'],
        _count: { id: true },
      }),
    ]);

    return {
      meetingPlatforms: recordingPlatforms.map((r) => ({ platform: r.meetingPlatform, count: r._count.id })),
      osPlatforms: devicePlatforms.map((d) => ({ platform: d.platform, count: d._count.id })),
    };
  }
}
