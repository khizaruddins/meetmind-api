import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';

@Injectable()
export class AdminUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsageSummary() {
    const [totalRecordings, totalSecondsStats, activeUsersToday, sessionsToday, platformBreakdown, planUsageBreakdown] =
      await Promise.all([
        this.prisma.recordingSession.count(),
        this.prisma.recordingSession.aggregate({
          _sum: { durationSeconds: true },
          _avg: { durationSeconds: true },
        }),
        this.prisma.dailyUsage.count({
          where: { usageDate: new Date().toISOString().split('T')[0], recordingCount: { gt: 0 } },
        }),
        this.prisma.recordingSession.count({
          where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        }),
        this.prisma.recordingSession.groupBy({
          by: ['meetingPlatform'],
          _count: { id: true },
          _sum: { durationSeconds: true },
        }),
        this.prisma.recordingSession.groupBy({
          by: ['authorizationType'],
          _count: { id: true },
          _sum: { durationSeconds: true },
        }),
      ]);

    const totalSeconds = totalSecondsStats._sum.durationSeconds || 0;
    const avgDuration = Math.round(totalSecondsStats._avg.durationSeconds || 0);

    return {
      totalRecordings,
      totalRecordingSeconds: totalSeconds,
      totalRecordingMinutes: Math.round((totalSeconds / 60) * 10) / 10,
      averageRecordingDurationSeconds: avgDuration,
      activeRecordingUsersToday: activeUsersToday,
      recordingsToday: sessionsToday,
      recordingsByPlatform: platformBreakdown.map((p) => ({
        platform: p.meetingPlatform,
        count: p._count.id,
        seconds: p._sum.durationSeconds || 0,
      })),
      usageByPlan: planUsageBreakdown.map((u) => ({
        plan: u.authorizationType,
        count: u._count.id,
        seconds: u._sum.durationSeconds || 0,
      })),
    };
  }

  async getDailyUsageTrend(days = 30) {
    const usages = await this.prisma.dailyUsage.findMany({
      orderBy: { usageDate: 'desc' },
      take: days * 20, // across users
    });

    const dayMap: Record<string, { seconds: number; recordings: number; users: Set<string> }> = {};
    for (const u of usages) {
      if (!dayMap[u.usageDate]) {
        dayMap[u.usageDate] = { seconds: 0, recordings: 0, users: new Set() };
      }
      dayMap[u.usageDate].seconds += u.recordingSeconds;
      dayMap[u.usageDate].recordings += u.recordingCount;
      dayMap[u.usageDate].users.add(u.userId);
    }

    const items = Object.entries(dayMap)
      .map(([date, data]) => ({
        date,
        recordingSeconds: data.seconds,
        recordingMinutes: Math.round((data.seconds / 60) * 10) / 10,
        recordings: data.recordings,
        activeUsers: data.users.size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return { dailyTrend: items };
  }

  async getMonthlyUsageTrend() {
    const usages = await this.prisma.dailyUsage.findMany();
    const monthMap: Record<string, { seconds: number; recordings: number; users: Set<string> }> = {};

    for (const u of usages) {
      const month = u.usageDate.substring(0, 7);
      if (!monthMap[month]) {
        monthMap[month] = { seconds: 0, recordings: 0, users: new Set() };
      }
      monthMap[month].seconds += u.recordingSeconds;
      monthMap[month].recordings += u.recordingCount;
      monthMap[month].users.add(u.userId);
    }

    const items = Object.entries(monthMap)
      .map(([month, data]) => ({
        month,
        recordingSeconds: data.seconds,
        recordingMinutes: Math.round((data.seconds / 60) * 10) / 10,
        recordings: data.recordings,
        activeUsers: data.users.size,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return { monthlyTrend: items };
  }

  // Section 32: Recording Metadata Administration
  async listRecordings(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.platform) where.meetingPlatform = query.platform;
    if (query.status) where.status = query.status;
    if (query.plan) where.authorizationType = query.plan.toUpperCase();
    if (query.autoStarted !== undefined) where.autoStarted = query.autoStarted === 'true';

    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) where.startedAt.gte = new Date(query.from);
      if (query.to) where.startedAt.lte = new Date(query.to);
    }

    const [total, items] = await Promise.all([
      this.prisma.recordingSession.count({ where }),
      this.prisma.recordingSession.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return paginate(
      items.map((i) => ({
        id: i.id,
        user: i.user,
        meetingTitle: i.meetingTitle,
        meetingPlatform: i.meetingPlatform,
        meetingId: i.meetingId,
        startedAt: i.startedAt,
        endedAt: i.endedAt,
        durationSeconds: i.durationSeconds,
        durationMinutes: Math.round((i.durationSeconds / 60) * 10) / 10,
        status: i.status,
        authorizationType: i.authorizationType,
        autoStarted: i.autoStarted,
        autoStopped: i.autoStopped,
        captureSource: i.captureSource,
        encoder: i.encoder,
        deviceId: i.deviceId,
      })),
      total,
      page,
      limit,
    );
  }

  async getRecording(id: string) {
    const recording = await this.prisma.recordingSession.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        usageEvents: true,
      },
    });

    if (!recording) throw new NotFoundException({ code: 'RECORDING_NOT_FOUND', message: 'Recording not found' });
    return recording;
  }
}
