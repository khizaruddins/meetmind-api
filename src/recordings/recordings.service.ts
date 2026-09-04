import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  AuthorizeRecordingDto,
  CompleteRecordingDto,
  FailRecordingDto,
  HeartbeatRecordingDto,
  QueryRecordingsDto,
  StartRecordingDto,
} from './dto/recording-ops.dto';
import { paginate } from '../common/dto/pagination.dto';

@Injectable()
export class RecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  private getTodayUtcString(): string {
    return new Date().toISOString().split('T')[0];
  }

  async authorize(userId: string, dto: AuthorizeRecordingDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        trial: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    if (user.status === 'DISABLED' || user.deletedAt) {
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', message: 'User account is disabled' });
    }

    const now = new Date();
    const activeSub = user.subscriptions[0];
    const isPaid = activeSub && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');

    if (isPaid) {
      const planCode = activeSub.plan.code.toLowerCase();
      const session = await this.prisma.recordingSession.create({
        data: {
          userId,
          deviceId: dto.deviceId,
          meetingPlatform: dto.meetingPlatform || 'manual',
          meetingId: dto.meetingId,
          meetingTitle: dto.meetingTitle || 'Meeting Recording',
          status: 'ACTIVE',
          authorizationType: activeSub.plan.code,
          maxDurationSeconds: null,
          autoStarted: dto.autoStarted || false,
          captureSource: dto.captureSource,
          encoder: dto.encoder,
          lastHeartbeatAt: now,
        },
      });

      return {
        authorized: true,
        recordingSessionId: session.id,
        maxDurationSeconds: null,
        plan: planCode,
      };
    }

    // Trial verification
    const trial = user.trial;
    if (!trial || trial.status !== 'ACTIVE' || trial.expiresAt < now) {
      throw new ForbiddenException({
        code: 'TRIAL_EXPIRED',
        message: 'Your 30-day trial has expired. Upgrade to Silver or Gold to continue recording.',
      });
    }

    const todayStr = this.getTodayUtcString();
    const dailyUsage = await this.prisma.dailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate: todayStr,
        },
      },
    });

    const usedTodaySeconds = dailyUsage ? dailyUsage.recordingSeconds : 0;
    const dailyLimit = 1800; // 30 minutes in seconds
    const remainingToday = Math.max(0, dailyLimit - usedTodaySeconds);

    if (remainingToday <= 0) {
      throw new ForbiddenException({
        code: 'TRIAL_DAILY_LIMIT_REACHED',
        message: 'Daily trial recording limit reached (30 minutes per day). Upgrade to Silver or Gold for unlimited recording.',
      });
    }

    const session = await this.prisma.recordingSession.create({
      data: {
        userId,
        deviceId: dto.deviceId,
        meetingPlatform: dto.meetingPlatform || 'manual',
        meetingId: dto.meetingId,
        meetingTitle: dto.meetingTitle || 'Meeting Recording',
        status: 'ACTIVE',
        authorizationType: 'TRIAL',
        maxDurationSeconds: remainingToday,
        autoStarted: dto.autoStarted || false,
        captureSource: dto.captureSource,
        encoder: dto.encoder,
        lastHeartbeatAt: now,
      },
    });

    return {
      authorized: true,
      recordingSessionId: session.id,
      maxDurationSeconds: remainingToday,
      plan: 'trial',
    };
  }

  async start(userId: string, dto: StartRecordingDto) {
    if (dto.recordingSessionId) {
      const session = await this.prisma.recordingSession.findFirst({
        where: { id: dto.recordingSessionId, userId },
      });
      if (session) {
        return {
          authorized: true,
          recordingSessionId: session.id,
          maxDurationSeconds: session.maxDurationSeconds,
          plan: session.authorizationType.toLowerCase(),
        };
      }
    }
    return this.authorize(userId, dto);
  }

  async heartbeat(userId: string, sessionId: string, dto: HeartbeatRecordingDto) {
    const session = await this.prisma.recordingSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Recording session not found' });
    }

    const now = new Date();
    await this.prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        lastHeartbeatAt: now,
        durationSeconds: dto.elapsedDurationSeconds,
      },
    });

    let shouldStop = false;
    if (session.maxDurationSeconds && dto.elapsedDurationSeconds >= session.maxDurationSeconds) {
      shouldStop = true;
    }

    return {
      ok: true,
      shouldStop,
      remainingSeconds: session.maxDurationSeconds
        ? Math.max(0, session.maxDurationSeconds - dto.elapsedDurationSeconds)
        : null,
    };
  }

  async complete(userId: string, sessionId: string, dto: CompleteRecordingDto) {
    const session = await this.prisma.recordingSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Recording session not found' });
    }

    const finalDuration = Math.max(session.durationSeconds, dto.durationSeconds);
    const now = new Date();

    await this.prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        endedAt: now,
        durationSeconds: finalDuration,
        autoStopped: dto.autoStopped || false,
      },
    });

    // Atomically reconcile into DailyUsage
    const todayStr = this.getTodayUtcString();
    await this.prisma.dailyUsage.upsert({
      where: {
        userId_usageDate: {
          userId,
          usageDate: todayStr,
        },
      },
      create: {
        userId,
        usageDate: todayStr,
        recordingSeconds: finalDuration,
        recordingCount: 1,
      },
      update: {
        recordingSeconds: { increment: finalDuration },
        recordingCount: { increment: 1 },
      },
    });

    await this.prisma.recordingUsageEvent.create({
      data: {
        recordingSessionId: sessionId,
        userId,
        secondsDelta: finalDuration,
        eventType: 'COMPLETED',
      },
    });

    return {
      success: true,
      recordingSessionId: sessionId,
      finalDurationSeconds: finalDuration,
    };
  }

  async fail(userId: string, sessionId: string, dto: FailRecordingDto) {
    const session = await this.prisma.recordingSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Recording session not found' });
    }

    const duration = dto.durationSeconds || session.durationSeconds || 0;
    const now = new Date();

    await this.prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        status: 'FAILED',
        endedAt: now,
        durationSeconds: duration,
      },
    });

    if (duration > 0) {
      const todayStr = this.getTodayUtcString();
      await this.prisma.dailyUsage.upsert({
        where: { userId_usageDate: { userId, usageDate: todayStr } },
        create: { userId, usageDate: todayStr, recordingSeconds: duration, recordingCount: 1 },
        update: { recordingSeconds: { increment: duration }, recordingCount: { increment: 1 } },
      });
    }

    return { success: true, message: 'Recording failure logged' };
  }

  async listRecordings(userId: string, q: QueryRecordingsDto) {
    const page = q.page || 1;
    const limit = q.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (q.platform) where.meetingPlatform = q.platform;
    if (q.status) where.status = q.status;
    if (q.deviceId) where.deviceId = q.deviceId;
    if (q.minDuration !== undefined) where.durationSeconds = { ...where.durationSeconds, gte: q.minDuration };
    if (q.maxDuration !== undefined) where.durationSeconds = { ...where.durationSeconds, lte: q.maxDuration };

    if (q.from || q.to) {
      where.startedAt = {};
      if (q.from) where.startedAt.gte = new Date(q.from);
      if (q.to) where.startedAt.lte = new Date(q.to);
    }

    let orderBy: any = { startedAt: 'desc' };
    if (q.sort === 'oldest') orderBy = { startedAt: 'asc' };
    if (q.sort === 'duration_desc') orderBy = { durationSeconds: 'desc' };
    if (q.sort === 'duration_asc') orderBy = { durationSeconds: 'asc' };

    const [total, sessions] = await Promise.all([
      this.prisma.recordingSession.count({ where }),
      this.prisma.recordingSession.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    const mapped = sessions.map((s) => ({
      id: s.id,
      title: s.meetingTitle,
      meetingTitle: s.meetingTitle,
      platform: s.meetingPlatform,
      meetingPlatform: s.meetingPlatform,
      meetingId: s.meetingId,
      startedAt: s.startedAt,
      createdAt: s.startedAt,
      endedAt: s.endedAt,
      durationSeconds: s.durationSeconds,
      durationMinutes: Math.round((s.durationSeconds / 60) * 10) / 10,
      status: s.status,
      authorizationType: s.authorizationType,
      autoStarted: s.autoStarted,
      autoStopped: s.autoStopped,
      captureMode: s.autoStarted ? 'Auto' : 'Manual',
      deviceId: s.deviceId,
      deviceName: 'Desktop App',
    }));

    const paginated = paginate(mapped, total, page, limit);

    return {
      ...paginated,
      recordings: paginated.data,
      total,
    };
  }

  async getRecording(userId: string, id: string) {
    const session = await this.prisma.recordingSession.findFirst({
      where: { id, userId },
    });
    if (!session) {
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: 'Recording session not found' });
    }
    return session;
  }

  async deleteMetadata(userId: string, id: string) {
    await this.getRecording(userId, id);
    await this.prisma.recordingSession.delete({ where: { id } });
    return { success: true, message: 'Recording session metadata deleted' };
  }
}
