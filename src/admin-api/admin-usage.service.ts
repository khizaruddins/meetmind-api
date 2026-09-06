import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';

@Injectable()
export class AdminUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsageSummary() {
    const [
      totalRecordings,
      totalSecondsStats,
      activeUsersToday,
      sessionsToday,
      autoStartedCount,
      devices,
      planUsageBreakdown,
      crashes,
    ] = await Promise.all([
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
      this.prisma.recordingSession.count({
        where: { autoStarted: true },
      }),
      this.prisma.device.findMany({
        select: { platform: true, userId: true },
      }),
      this.prisma.recordingSession.groupBy({
        by: ['authorizationType'],
        _count: { id: true },
        _sum: { durationSeconds: true },
      }),
      this.prisma.recordingSession.findMany({
        where: { status: { in: ['ABANDONED', 'FAILED'] } },
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    const totalSeconds = totalSecondsStats._sum.durationSeconds || 0;
    const avgSeconds = totalRecordings > 0 ? Math.round(totalSeconds / totalRecordings) : 0;
    const avgDurationMinutes = Math.round((avgSeconds / 60) * 10) / 10;
    const totalMinutes = Math.round((totalSeconds / 60) * 10) / 10;
    const autoDetectionRate =
      totalRecordings > 0 ? Math.round((autoStartedCount / totalRecordings) * 1000) / 10 : 0;

    // Real OS breakdown
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
        name: 'Windows 10 / 11 (WASAPI + WGC)',
        os: 'Windows',
        count: osMap.Windows.size,
        percentage: Math.round((osMap.Windows.size / totalOsCount) * 100),
      },
      {
        name: 'macOS (ScreenCaptureKit)',
        os: 'macOS',
        count: osMap.macOS.size,
        percentage: Math.round((osMap.macOS.size / totalOsCount) * 100),
      },
      {
        name: 'Linux (PipeWire / X11)',
        os: 'Linux',
        count: osMap.Linux.size,
        percentage: Math.round((osMap.Linux.size / totalOsCount) * 100),
      },
    ];

    // Real Tier breakdown
    const tierMap: Record<string, { count: number; seconds: number }> = {};
    for (const u of planUsageBreakdown) {
      tierMap[u.authorizationType] = {
        count: u._count.id,
        seconds: u._sum.durationSeconds || 0,
      };
    }
    const totalTierSeconds = Math.max(1, totalSeconds);
    const tierBreakdown = [
      {
        tier: 'Trial Tier (30 min/day limit)',
        code: 'TRIAL',
        count: tierMap['TRIAL']?.count || 0,
        percentage: Math.round(((tierMap['TRIAL']?.seconds || 0) / totalTierSeconds) * 100),
      },
      {
        tier: 'Silver Plan (Unlimited)',
        code: 'SILVER',
        count: tierMap['SILVER']?.count || 0,
        percentage: Math.round(((tierMap['SILVER']?.seconds || 0) / totalTierSeconds) * 100),
      },
      {
        tier: 'Gold Plan (AI Intelligence)',
        code: 'GOLD',
        count: tierMap['GOLD']?.count || 0,
        percentage: Math.round(((tierMap['GOLD']?.seconds || 0) / totalTierSeconds) * 100),
      },
      {
        tier: 'Enterprise Plan',
        code: 'ENTERPRISE',
        count: tierMap['ENTERPRISE']?.count || 0,
        percentage: Math.round(((tierMap['ENTERPRISE']?.seconds || 0) / totalTierSeconds) * 100),
      },
    ];

    return {
      totalRecordings,
      totalMinutes,
      totalRecordingMinutes: totalMinutes,
      totalRecordingSeconds: totalSeconds,
      averageDurationMinutes: avgDurationMinutes,
      averageRecordingDurationSeconds: avgSeconds,
      autoDetectionRate,
      autoDetectionRatePercent: autoDetectionRate,
      activeRecordingUsersToday: activeUsersToday,
      recordingsToday: sessionsToday,
      osBreakdown,
      tierBreakdown,
      crashReports: crashes.map((c) => ({
        id: c.id,
        title: c.meetingTitle,
        platform: c.meetingPlatform,
        status: c.status,
        startedAt: c.startedAt,
        userEmail: c.user.email,
        userName: c.user.displayName || c.user.email,
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
