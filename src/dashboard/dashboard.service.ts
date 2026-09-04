import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private getTodayUtcString(): string {
    return new Date().toISOString().split('T')[0];
  }

  async getCustomerDashboard(userId: string) {
    const todayStr = this.getTodayUtcString();
    const currentMonthStr = todayStr.substring(0, 7);

    const [user, todayUsage, allUsages, recentRecordings, latestInvoice, deviceCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          trial: true,
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.dailyUsage.findUnique({
        where: { userId_usageDate: { userId, usageDate: todayStr } },
      }),
      this.prisma.dailyUsage.findMany({
        where: { userId },
      }),
      this.prisma.recordingSession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: 5,
      }),
      this.prisma.invoice.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.device.count({
        where: { userId, status: 'ACTIVE' },
      }),
    ]);

    const activeSub = user?.subscriptions[0];
    const isPaid = activeSub && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');

    const totalRecordingSeconds = allUsages.reduce((acc, u) => acc + u.recordingSeconds, 0);
    const totalRecordings = allUsages.reduce((acc, u) => acc + u.recordingCount, 0);

    const thisMonthUsages = allUsages.filter((u) => u.usageDate.startsWith(currentMonthStr));
    const thisMonthSeconds = thisMonthUsages.reduce((acc, u) => acc + u.recordingSeconds, 0);
    const thisMonthRecordings = thisMonthUsages.reduce((acc, u) => acc + u.recordingCount, 0);

    const usedTodaySeconds = todayUsage ? todayUsage.recordingSeconds : 0;
    const recordingsToday = todayUsage ? todayUsage.recordingCount : 0;
    const limitSeconds = isPaid ? null : 1800;
    const remainingTodaySeconds = limitSeconds !== null ? Math.max(0, limitSeconds - usedTodaySeconds) : null;

    const now = new Date();
    const trialDaysRemaining = user?.trial
      ? Math.max(0, Math.ceil((user.trial.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    return {
      plan: isPaid ? activeSub.plan.code.toLowerCase() : 'trial',
      status: isPaid ? activeSub.status.toLowerCase() : user?.trial?.status === 'ACTIVE' ? 'trial' : 'expired',
      subscriptionStatus: isPaid ? activeSub.status.toLowerCase() : user?.trial?.status === 'ACTIVE' ? 'trial' : 'expired',
      trialDaysRemaining,
      recordingMinutesRemainingToday: remainingTodaySeconds !== null ? Math.round((remainingTodaySeconds / 60) * 10) / 10 : null,
      recordingSecondsRemainingToday: remainingTodaySeconds,
      usageTodaySeconds: usedTodaySeconds,
      recordingsToday,
      recordingsThisMonth: thisMonthRecordings,
      recordingsCount: totalRecordings,
      totalRecordings,
      totalRecordingMinutes: Math.round((totalRecordingSeconds / 60) * 10) / 10,
      thisMonthRecordingMinutes: Math.round((thisMonthSeconds / 60) * 10) / 10,
      billingStatus: isPaid ? 'current' : 'trial',
      latestInvoice: latestInvoice
        ? {
            id: latestInvoice.id,
            invoiceNumber: latestInvoice.invoiceNumber,
            amountPaid: latestInvoice.amountPaid,
            currency: latestInvoice.currency,
            status: latestInvoice.status,
            date: latestInvoice.createdAt,
          }
        : null,
      deviceCount,
      recentRecordings: recentRecordings.map((r) => ({
        id: r.id,
        meetingTitle: r.meetingTitle,
        meetingPlatform: r.meetingPlatform,
        durationSeconds: r.durationSeconds,
        durationMinutes: Math.round((r.durationSeconds / 60) * 10) / 10,
        startedAt: r.startedAt,
        status: r.status,
      })),
    };
  }

  async getCustomerDashboardOverview(userId: string) {
    const todayStr = this.getTodayUtcString();
    const currentMonthStr = todayStr.substring(0, 7);
    const now = new Date();

    const [user, todayUsage, allUsages, recentRecordings, latestInvoice, latestPayment, deviceCount] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          include: {
            profile: true,
            trial: true,
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
              include: { plan: { include: { planFeatures: true } } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        }),
        this.prisma.dailyUsage.findUnique({
          where: { userId_usageDate: { userId, usageDate: todayStr } },
        }),
        this.prisma.dailyUsage.findMany({
          where: { userId },
        }),
        this.prisma.recordingSession.findMany({
          where: { userId },
          orderBy: { startedAt: 'desc' },
          take: 5,
        }),
        this.prisma.invoice.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.payment.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.device.count({
          where: { userId, status: 'ACTIVE' },
        }),
      ]);

    const activeSub = user?.subscriptions[0];
    const isPaid = activeSub && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');

    const totalRecordingSeconds = allUsages.reduce((acc, u) => acc + u.recordingSeconds, 0);
    const totalRecordings = allUsages.reduce((acc, u) => acc + u.recordingCount, 0);

    const thisMonthUsages = allUsages.filter((u) => u.usageDate.startsWith(currentMonthStr));
    const thisMonthSeconds = thisMonthUsages.reduce((acc, u) => acc + u.recordingSeconds, 0);
    const thisMonthRecordings = thisMonthUsages.reduce((acc, u) => acc + u.recordingCount, 0);

    const usedTodaySeconds = todayUsage ? todayUsage.recordingSeconds : 0;
    const recordingsToday = todayUsage ? todayUsage.recordingCount : 0;
    const limitSeconds = isPaid ? null : 1800;
    const remainingTodaySeconds = limitSeconds !== null ? Math.max(0, limitSeconds - usedTodaySeconds) : null;

    const trialDaysRemaining = user?.trial
      ? Math.max(0, Math.ceil((user.trial.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    const featuresMap: Record<string, boolean> = {};
    if (activeSub?.plan?.planFeatures) {
      for (const f of activeSub.plan.planFeatures) {
        featuresMap[f.featureKey] = f.enabled;
      }
    }

    return {
      user: {
        id: user?.id,
        name:
          user?.displayName ||
          `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
          user?.email.split('@')[0],
        email: user?.email,
        emailVerified: user?.emailVerified ?? false,
      },
      plan: {
        code: isPaid ? activeSub.plan.code : 'TRIAL',
        name: isPaid ? activeSub.plan.name : 'Trial',
      },
      trial: {
        active: user?.trial?.status === 'ACTIVE' && user.trial.expiresAt > now,
        daysRemaining: trialDaysRemaining,
        expiresAt: user?.trial?.expiresAt || null,
      },
      usage: {
        todaySeconds: usedTodaySeconds,
        dailyLimitSeconds: limitSeconds ?? 0,
        remainingTodaySeconds: remainingTodaySeconds ?? 0,
        monthSeconds: thisMonthSeconds,
      },
      recordings: {
        today: recordingsToday,
        month: thisMonthRecordings,
        total: totalRecordings,
        totalDurationSeconds: totalRecordingSeconds,
        recent: recentRecordings.map((r) => ({
          id: r.id,
          title: r.meetingTitle || 'Meeting',
          meetingTitle: r.meetingTitle,
          meetingPlatform: r.meetingPlatform,
          durationSeconds: r.durationSeconds,
          durationMinutes: Math.round((r.durationSeconds / 60) * 10) / 10,
          startedAt: r.startedAt,
          createdAt: r.createdAt,
          status: r.status,
        })),
      },
      subscription: {
        status: isPaid
          ? activeSub.status.toLowerCase()
          : user?.trial?.status === 'ACTIVE'
          ? 'trial'
          : 'expired',
        nextBillingDate: isPaid ? activeSub.currentPeriodEnd : null,
      },
      billing: {
        latestInvoice: latestInvoice
          ? {
              id: latestInvoice.id,
              invoiceNumber: latestInvoice.invoiceNumber,
              amountPaid: latestInvoice.amountPaid,
              currency: latestInvoice.currency,
              status: latestInvoice.status,
              date: latestInvoice.createdAt,
            }
          : null,
        latestPayment: latestPayment
          ? {
              id: latestPayment.id,
              amount: latestPayment.amount,
              currency: latestPayment.currency,
              status: latestPayment.status,
              createdAt: latestPayment.createdAt,
            }
          : null,
      },
      devices: {
        count: deviceCount,
      },
      entitlements: {
        unlimitedRecording: Boolean(isPaid),
        googleMeetAutomation: true,
        screenCapture: true,
        hardwareAcceleration: Boolean(isPaid),
        aiFeatures: activeSub?.plan?.code === 'GOLD',
        features: featuresMap,
      },
    };
  }
}
