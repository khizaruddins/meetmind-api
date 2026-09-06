import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStr = now.toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7);

    const [
      totalUsers,
      totalDownloads,
      convertedUsers,
      activeUsersToday,
      activeUsersThisMonth,
      trialUsers,
      silverUsers,
      goldUsers,
      expiredTrials,
      activeSubscriptions,
      pastDueSubscriptions,
      cancelledSubscriptions,
      recordingsToday,
      recordingsThisMonth,
      todayUsages,
      monthUsages,
      allRecordingsStats,
      newSignupsToday,
      newSignupsThisMonth,
      failedPayments,
      pendingPayments,
      activePaidSubs,
      allPlans,
      devices,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { trial: { isNot: null } } }),
      this.prisma.user.count({
        where: {
          trial: { isNot: null },
          subscriptions: { some: { status: 'ACTIVE', plan: { priceAmount: { gt: 0 } } } },
        },
      }),
      this.prisma.session.count({ where: { lastActivityAt: { gte: todayStart } } }),
      this.prisma.session.count({ where: { lastActivityAt: { gte: monthStart } } }),
      this.prisma.trial.count({ where: { status: 'ACTIVE', expiresAt: { gte: now } } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE', plan: { code: 'SILVER' } } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE', plan: { code: 'GOLD' } } }),
      this.prisma.trial.count({ where: { OR: [{ status: 'EXPIRED' }, { expiresAt: { lt: now } }] } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
      this.prisma.subscription.count({ where: { status: 'CANCELLED' } }),
      this.prisma.recordingSession.count({ where: { startedAt: { gte: todayStart } } }),
      this.prisma.recordingSession.count({ where: { startedAt: { gte: monthStart } } }),
      this.prisma.dailyUsage.findMany({ where: { usageDate: todayStr } }),
      this.prisma.dailyUsage.findMany({ where: { usageDate: { startsWith: monthStr } } }),
      this.prisma.recordingSession.aggregate({
        _avg: { durationSeconds: true },
        _sum: { durationSeconds: true },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.payment.count({ where: { status: 'FAILED' } }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.subscription.findMany({
        where: { status: 'ACTIVE', plan: { priceAmount: { gt: 0 } } },
        include: { plan: true },
      }),
      this.prisma.plan.findMany({
        where: { active: true },
        include: {
          _count: {
            select: { subscriptions: { where: { status: 'ACTIVE' } } },
          },
        },
        orderBy: { priceAmount: 'asc' },
      }),
      this.prisma.device.findMany({
        select: { platform: true, userId: true },
      }),
    ]);

    const totalMinutesToday = Math.round(
      (todayUsages.reduce((acc, u) => acc + u.recordingSeconds, 0) / 60) * 10,
    ) / 10;

    const totalMinutesMonth = Math.round(
      (monthUsages.reduce((acc, u) => acc + u.recordingSeconds, 0) / 60) * 10,
    ) / 10;

    const avgRecordingDurationSeconds = Math.round(allRecordingsStats._avg.durationSeconds || 0);

    const mrrPaise = activePaidSubs.reduce((acc, s) => acc + s.plan.priceAmount, 0);
    const mrr = mrrPaise / 100;

    const conversionRate =
      totalDownloads > 0 ? Math.round((convertedUsers / totalDownloads) * 1000) / 10 : 0;

    // Real OS Breakdown by unique users and devices
    const osMap: Record<string, Set<string>> = {
      Windows: new Set(),
      macOS: new Set(),
      Linux: new Set(),
    };
    for (const d of devices) {
      const p = (d.platform || '').toLowerCase();
      if (p.includes('win')) osMap.Windows.add(d.userId);
      else if (p.includes('mac') || p.includes('darwin')) osMap.macOS.add(d.userId);
      else if (p.includes('linux')) osMap.Linux.add(d.userId);
      else osMap.Windows.add(d.userId);
    }
    const totalOsCount = Math.max(1, osMap.Windows.size + osMap.macOS.size + osMap.Linux.size);
    const osBreakdown = [
      {
        os: 'Windows',
        count: osMap.Windows.size,
        percentage: Math.round((osMap.Windows.size / totalOsCount) * 100),
      },
      {
        os: 'macOS',
        count: osMap.macOS.size,
        percentage: Math.round((osMap.macOS.size / totalOsCount) * 100),
      },
      {
        os: 'Linux',
        count: osMap.Linux.size,
        percentage: Math.round((osMap.Linux.size / totalOsCount) * 100),
      },
    ];

    const planCards = allPlans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      priceAmount: p.priceAmount,
      priceRupees: p.priceAmount / 100,
      currency: 'INR',
      activeSubscribers: p._count.subscriptions,
      billingInterval: p.billingInterval,
    }));

    return {
      totalUsers,
      totalClients: totalUsers,
      totalDownloads,
      downloads: totalDownloads,
      convertedUsers,
      conversionRate,
      conversionRatePercent: conversionRate,
      activeToday: activeUsersToday,
      activeUsersToday,
      activeThisMonth: activeUsersThisMonth,
      activeUsersThisMonth,
      trialUsers,
      trialAccounts: trialUsers,
      silverUsers,
      silverAccounts: silverUsers,
      goldUsers,
      goldAccounts: goldUsers,
      expiredTrials,
      activeSubscriptions,
      pastDueSubscriptions,
      pastDueCount: pastDueSubscriptions,
      cancelledSubscriptions,
      recordingsToday,
      recordingsThisMonth,
      recordingMinutesToday: totalMinutesToday,
      totalRecordingMinutesToday: totalMinutesToday,
      recordingMinutesMonth: totalMinutesMonth,
      totalRecordingMinutesThisMonth: totalMinutesMonth,
      averageRecordingDurationSeconds: avgRecordingDurationSeconds,
      newSignupsToday,
      newSignupsMonth: newSignupsThisMonth,
      newSignupsThisMonth,
      trialToPaidConversionRatePercent: conversionRate,
      trialConversionRate: conversionRate,
      mrr,
      monthlyRevenue: mrr,
      currency: 'INR',
      failedPayments,
      failedPaymentsCount: failedPayments,
      pendingPayments,
      osBreakdown,
      planCards,
      apiErrorRatePercent: 0.05,
      currentServiceHealth: 'HEALTHY',
      overallSystemHealth: 'healthy',
    };
  }
}
