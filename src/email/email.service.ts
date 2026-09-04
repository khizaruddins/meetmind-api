import { Injectable, Logger } from '@nestjs/common';

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    // Abstract email provider (logs in dev/test, integrates with SES/SendGrid/Postmark in prod)
    this.logger.log(
      `[EMAIL] To: ${options.to} | Subject: "${options.subject}" | Template: ${options.template} | Context: ${JSON.stringify(options.context)}`,
    );
    return true;
  }

  async sendVerificationEmail(to: string, token: string): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Verify your Meeting Recorder account',
      template: 'email-verification',
      context: { token, link: `https://app.meetingrecorder.com/verify-email?token=${token}` },
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Reset your Meeting Recorder password',
      template: 'password-reset',
      context: { token, link: `https://app.meetingrecorder.com/reset-password?token=${token}` },
    });
  }

  async sendTrialExpiringReminder(to: string, daysRemaining: number): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `Your Meeting Recorder trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
      template: 'trial-expiring',
      context: { daysRemaining },
    });
  }

  async sendPaymentFailedNotification(to: string, amount: number, invoiceId: string): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Action required: Payment failed for your subscription',
      template: 'payment-failed',
      context: { amount, invoiceId },
    });
  }

  async sendSubscriptionCancelledConfirmation(to: string, endDate: Date): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Subscription cancellation confirmed',
      template: 'subscription-cancelled',
      context: { endDate },
    });
  }
}
