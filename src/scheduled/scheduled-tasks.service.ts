import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // Expire overdue trials every hour
  @Cron(CronExpression.EVERY_HOUR)
  async handleTrialExpirations() {
    const now = new Date();
    const expired = await this.prisma.trial.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    if (expired.count > 0) {
      this.logger.log(`Expired ${expired.count} trial account(s)`);
    }
  }

  // Detect stale recording sessions (no heartbeat in > 3 minutes)
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleStaleRecordingSessions() {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const abandoned = await this.prisma.recordingSession.updateMany({
      where: {
        status: 'ACTIVE',
        lastHeartbeatAt: { lt: threeMinutesAgo },
      },
      data: {
        status: 'ABANDONED',
        endedAt: new Date(),
      },
    });

    if (abandoned.count > 0) {
      this.logger.log(`Marked ${abandoned.count} abandoned recording session(s)`);
    }
  }

  // Send trial expiry warning reminders
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleTrialReminders() {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiringTrials = await this.prisma.trial.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gte: now,
          lte: threeDaysFromNow,
        },
      },
      include: { user: true },
    });

    for (const t of expiringTrials) {
      const daysLeft = Math.ceil((t.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      await this.emailService.sendTrialExpiringReminder(t.user.email, daysLeft);
    }
  }
}
