import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  getTodayUtcString(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
  }

  async getEntitlements(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        trial: true,
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
          include: {
            plan: {
              include: { planFeatures: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
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
    const now = new Date();

    const activeSub = user.subscriptions[0];
    const isPaidActive = activeSub && activeSub.status === 'ACTIVE' && (activeSub.plan.code === 'SILVER' || activeSub.plan.code === 'GOLD');

    if (isPaidActive) {
      const planCode = activeSub.plan.code.toLowerCase();
      const features = activeSub.plan.planFeatures.reduce((acc, f) => {
        acc[f.featureKey] = f.enabled;
        return acc;
      }, {} as Record<string, boolean>);
      features.ocr = true;

      // Build signed offline license token (7-day offline validity)
      const offlineExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const snapshotPayload = {
        userId: user.id,
        plan: planCode,
        features,
        subscriptionStatus: 'active',
        issuedAt: now.toISOString(),
        expiresAt: offlineExpiresAt.toISOString(),
      };

      const secret = process.env.OFFLINE_ENTITLEMENT_SECRET || 'dev-entitlement-hmac-secret-meeting-recorder-2026';
      const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(snapshotPayload)).digest('hex');

      return {
        plan: planCode,
        subscriptionStatus: 'active',
        currentPeriodEnd: activeSub.currentPeriodEnd,
        cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
        trial: null,
        recording: {
          allowed: true,
          dailyLimitSeconds: null,
          usedTodaySeconds,
          remainingTodaySeconds: null,
        },
        features,
        offlineLicense: {
          payload: snapshotPayload,
          signature,
          version: 'v1',
        },
      };
    }

    // Trial resolution
    const trial = user.trial;
    const isTrialActive = trial && trial.status === 'ACTIVE' && trial.expiresAt > now;
    const daysRemaining = trial
      ? Math.max(0, Math.ceil((trial.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    const dailyLimit = 1800; // 30 minutes in seconds
    const remainingToday = Math.max(0, dailyLimit - usedTodaySeconds);
    const allowed = isTrialActive && remainingToday > 0;

    const features: Record<string, boolean> = {
      recording: allowed,
      googleMeetAutomation: true,
      screenCapture: true,
      windowCapture: true,
      systemAudio: true,
      microphone: true,
      mp4Output: true,
      localRecordingHistory: true,
      ocr: true,
      unlimitedRecording: false,
      transcription: false,
      speakerDiarization: false,
      aiSummary: false,
      aiActionItems: false,
      aiDecisions: false,
      aiKeyInitiatives: false,
      aiMeetingNotes: false,
      aiBriefing: false,
      aiDocumentation: false,
    };

    return {
      plan: 'trial',
      subscriptionStatus: isTrialActive ? 'trial' : 'expired',
      trial: {
        active: isTrialActive,
        startedAt: trial?.startedAt,
        expiresAt: trial?.expiresAt,
        daysRemaining,
        extendedDays: trial?.extendedDays || 0,
      },
      recording: {
        allowed,
        dailyLimitSeconds: dailyLimit,
        usedTodaySeconds,
        remainingTodaySeconds: remainingToday,
      },
      features,
      offlineLicense: null, // Trial does not support offline license caching without server contact
    };
  }
}
