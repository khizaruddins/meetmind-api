import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

// Common
import { PrismaService } from './common/prisma.service';
import { Argon2Service } from './common/argon2.service';
import { CustomerJwtAuthGuard } from './common/guards/customer-jwt.guard';
import { AdminJwtAuthGuard } from './common/guards/admin-jwt.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

// Core Services
import { EmailService } from './email/email.service';
import { AuditService } from './audit/audit.service';
import { ScheduledTasksService } from './scheduled/scheduled-tasks.service';

// Customer Modules
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { SessionsService } from './sessions/sessions.service';
import { SessionsController } from './sessions/sessions.controller';
import { DevicesService } from './devices/devices.service';
import { DevicesController } from './devices/devices.controller';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { PlansService } from './plans/plans.service';
import { PlansController } from './plans/plans.controller';
import { EntitlementsService } from './entitlements/entitlements.service';
import { EntitlementsController } from './entitlements/entitlements.controller';
import { UsageService } from './usage/usage.service';
import { UsageController } from './usage/usage.controller';
import { RecordingsService } from './recordings/recordings.service';
import { RecordingsController } from './recordings/recordings.controller';
import { DevBillingProvider } from './billing/providers/dev-billing.provider';
import { StripeBillingProvider } from './billing/providers/stripe-billing.provider';
import { RazorpayBillingProvider } from './billing/providers/razorpay-billing.provider';
import { BillingService } from './billing/billing.service';
import { SubscriptionController } from './billing/subscription.controller';
import { PaymentsController } from './billing/payments.controller';
import { InvoicesController } from './billing/invoices.controller';
import { PaymentMethodsController } from './billing/payment-methods.controller';
import { WebhooksService } from './webhooks/webhooks.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { DashboardController } from './dashboard/dashboard.controller';

// Admin Modules
import { AdminAuthService } from './admins/admin-auth.service';
import { AdminAuthController } from './admins/admin-auth.controller';
import { AdminUsersService } from './admin-api/admin-users.service';
import { AdminUsersController } from './admin-api/admin-users.controller';
import { AdminTrialsService } from './admin-api/admin-trials.service';
import { AdminTrialsController } from './admin-api/admin-trials.controller';
import { AdminSubscriptionsService } from './admin-api/admin-subscriptions.service';
import { AdminSubscriptionsController } from './admin-api/admin-subscriptions.controller';
import { AdminPlansService } from './admin-api/admin-plans.service';
import { AdminPlansController } from './admin-api/admin-plans.controller';
import { AdminUsageService } from './admin-api/admin-usage.service';
import { AdminUsageController } from './admin-api/admin-usage.controller';
import { AdminBillingService } from './admin-api/admin-billing.service';
import { AdminBillingController } from './admin-api/admin-billing.controller';
import { AdminDashboardService } from './admin-api/admin-dashboard.service';
import { AdminDashboardController } from './admin-api/admin-dashboard.controller';
import { AdminAnalyticsService } from './admin-api/admin-analytics.service';
import { AdminAnalyticsController } from './admin-api/admin-analytics.controller';
import { AdminReportsService } from './admin-api/admin-reports.service';
import { AdminReportsController } from './admin-api/admin-reports.controller';
import { AdminAuditLogService } from './admin-api/admin-audit.service';
import { AdminAuditController } from './admin-api/admin-audit.controller';

// Health
import { HealthService } from './health/health.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    JwtModule.register({}),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
  ],
  controllers: [
    AuthController,
    SessionsController,
    DevicesController,
    UsersController,
    PlansController,
    EntitlementsController,
    UsageController,
    RecordingsController,
    SubscriptionController,
    PaymentsController,
    InvoicesController,
    PaymentMethodsController,
    WebhooksController,
    DashboardController,
    AdminAuthController,
    AdminUsersController,
    AdminTrialsController,
    AdminSubscriptionsController,
    AdminPlansController,
    AdminUsageController,
    AdminBillingController,
    AdminDashboardController,
    AdminAnalyticsController,
    AdminReportsController,
    AdminAuditController,
    HealthController,
  ],
  providers: [
    PrismaService,
    Argon2Service,
    CustomerJwtAuthGuard,
    AdminJwtAuthGuard,
    PermissionsGuard,
    EmailService,
    AuditService,
    ScheduledTasksService,
    AuthService,
    SessionsService,
    DevicesService,
    UsersService,
    PlansService,
    EntitlementsService,
    UsageService,
    RecordingsService,
    DevBillingProvider,
    StripeBillingProvider,
    RazorpayBillingProvider,
    BillingService,
    WebhooksService,
    DashboardService,
    AdminAuthService,
    AdminUsersService,
    AdminTrialsService,
    AdminSubscriptionsService,
    AdminPlansService,
    AdminUsageService,
    AdminBillingService,
    AdminDashboardService,
    AdminAnalyticsService,
    AdminReportsService,
    AdminAuditLogService,
    HealthService,
  ],
})
export class AppModule {}
