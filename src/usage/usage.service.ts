import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { getDailyOcrLimit, getDailyScreenshotLimit } from '../common/plan-limits';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  private getTodayUtcString(): string {
    return new Date().toISOString().split('T')[0];
  }

  async getTodayUsage(userId: string) {
    const todayStr = this.getTodayUtcString();
    const usage = await this.prisma.dailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate: todayStr,
        },
      },
    });

    const activeSub = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });

    const isPaid = activeSub && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');
    const plan = isPaid ? activeSub.plan.code.toLowerCase() : 'trial';
    const limitSeconds = isPaid ? null : 1800;
    const recordingSeconds = usage ? usage.recordingSeconds : 0;
    const recordings = usage ? usage.recordingCount : 0;
    const remainingSeconds = limitSeconds !== null ? Math.max(0, limitSeconds - recordingSeconds) : null;
    const screenshotLimit = getDailyScreenshotLimit(plan);
    const ocrLimit = getDailyOcrLimit(plan);
    const screenshots = usage?.screenshotCount || 0;
    const ocrRequests = usage?.aiRequests || 0;

    return {
      today: {
        date: todayStr,
        recordingSeconds,
        recordings,
        limitSeconds,
        remainingSeconds,
        transcriptionSeconds: usage?.transcriptionSeconds || 0,
        aiRequests: ocrRequests,
        screenshots,
        screenshotLimit,
        screenshotsRemaining: Math.max(0, screenshotLimit - screenshots),
        ocrRequests,
        ocrLimit,
        ocrRemaining: Math.max(0, ocrLimit - ocrRequests),
      },
    };
  }

  async getUsageHistory(userId: string, aggregation: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const usages = await this.prisma.dailyUsage.findMany({
      where: { userId },
      orderBy: { usageDate: 'desc' },
      take: 60,
    });

    if (aggregation === 'daily') {
      return {
        aggregation,
        items: usages.map((u) => ({
          period: u.usageDate,
          recordingSeconds: u.recordingSeconds,
          recordingMinutes: Math.round((u.recordingSeconds / 60) * 10) / 10,
          recordings: u.recordingCount,
        })),
      };
    }

    // Weekly or monthly grouping
    const groups: Record<string, { seconds: number; count: number }> = {};
    for (const u of usages) {
      let key = u.usageDate;
      if (aggregation === 'monthly') {
        key = u.usageDate.substring(0, 7); // YYYY-MM
      } else if (aggregation === 'weekly') {
        // Simple ISO week key
        const d = new Date(u.usageDate);
        const startOfWeek = new Date(d.setDate(d.getDate() - d.getDay())).toISOString().split('T')[0];
        key = `Week of ${startOfWeek}`;
      }

      if (!groups[key]) {
        groups[key] = { seconds: 0, count: 0 };
      }
      groups[key].seconds += u.recordingSeconds;
      groups[key].count += u.recordingCount;
    }

    return {
      aggregation,
      items: Object.entries(groups).map(([period, data]) => ({
        period,
        recordingSeconds: data.seconds,
        recordingMinutes: Math.round((data.seconds / 60) * 10) / 10,
        recordings: data.count,
      })),
    };
  }

  async getUsageSummary(userId: string) {
    const allUsages = await this.prisma.dailyUsage.findMany({
      where: { userId },
    });

    const totalSeconds = allUsages.reduce((acc, u) => acc + u.recordingSeconds, 0);
    const totalRecordings = allUsages.reduce((acc, u) => acc + u.recordingCount, 0);

    const todayStr = this.getTodayUtcString();
    const currentMonthStr = todayStr.substring(0, 7);

    const thisMonthUsages = allUsages.filter((u) => u.usageDate.startsWith(currentMonthStr));
    const thisMonthSeconds = thisMonthUsages.reduce((acc, u) => acc + u.recordingSeconds, 0);
    const thisMonthRecordings = thisMonthUsages.reduce((acc, u) => acc + u.recordingCount, 0);

    return {
      totalRecordingSeconds: totalSeconds,
      totalRecordingMinutes: Math.round((totalSeconds / 60) * 10) / 10,
      totalRecordings,
      thisMonthRecordingSeconds: thisMonthSeconds,
      thisMonthRecordingMinutes: Math.round((thisMonthSeconds / 60) * 10) / 10,
      thisMonthRecordings,
    };
  }
}
