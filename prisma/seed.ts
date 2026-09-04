import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Roles & Permissions
  const permissionsList = [
    { key: 'users.read', description: 'Read user profiles and lists' },
    { key: 'users.write', description: 'Create and edit users' },
    { key: 'users.delete', description: 'Disable or delete users' },
    { key: 'subscriptions.read', description: 'Read customer subscriptions' },
    { key: 'subscriptions.write', description: 'Create, edit, cancel subscriptions' },
    { key: 'subscriptions.change_plan', description: 'Change customer subscription plan' },
    { key: 'subscriptions.cancel', description: 'Cancel customer subscriptions' },
    { key: 'subscriptions.resume', description: 'Resume cancelled customer subscriptions' },
    { key: 'subscriptions.extend', description: 'Extend customer subscription period' },
    { key: 'subscriptions.override_status', description: 'Override subscription status' },
    { key: 'subscription.override', description: 'Override subscription status and parameters' },
    { key: 'plans.read', description: 'Read plans and pricing' },
    { key: 'plans.write', description: 'Create and edit plans' },
    { key: 'trial.extend', description: 'Extend or reset customer trials and usage' },
    { key: 'usage.read', description: 'Read customer recording usage metrics' },
    { key: 'recordings.read', description: 'Read recording session metadata' },
    { key: 'billing.read', description: 'Read billing summaries' },
    { key: 'payments.read', description: 'Read payment transaction logs' },
    { key: 'invoices.read', description: 'Read customer invoices' },
    { key: 'analytics.read', description: 'Read business analytics and reports' },
    { key: 'system.health', description: 'Inspect system and infrastructure health' },
    { key: 'audit.read', description: 'Inspect administrative audit logs' },
  ];

  for (const p of permissionsList) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: p,
      update: { description: p.description },
    });
  }

  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    create: { name: 'SUPER_ADMIN', description: 'Complete system access' },
    update: {},
  });

  const supportAdminRole = await prisma.role.upsert({
    where: { name: 'SUPPORT_ADMIN' },
    create: { name: 'SUPPORT_ADMIN', description: 'Customer support, trial extensions, user inspect' },
    update: {},
  });

  const billingAdminRole = await prisma.role.upsert({
    where: { name: 'BILLING_ADMIN' },
    create: { name: 'BILLING_ADMIN', description: 'Invoices, payments, subscription management' },
    update: {},
  });

  const analyticsAdminRole = await prisma.role.upsert({
    where: { name: 'ANALYTICS_ADMIN' },
    create: { name: 'ANALYTICS_ADMIN', description: 'Business analytics and reporting' },
    update: {},
  });

  const readOnlyAdminRole = await prisma.role.upsert({
    where: { name: 'READ_ONLY_ADMIN' },
    create: { name: 'READ_ONLY_ADMIN', description: 'Read-only visibility across system' },
    update: {},
  });

  // Connect all permissions to SUPER_ADMIN
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id },
      },
      create: { roleId: superAdminRole.id, permissionId: perm.id },
      update: {},
    });
  }

  // Connect billing permissions to BILLING_ADMIN
  const billingPerms = allPerms.filter(
    (p) =>
      p.key.startsWith('subscriptions.') ||
      p.key.startsWith('billing.') ||
      p.key.startsWith('payments.') ||
      p.key.startsWith('invoices.') ||
      p.key.startsWith('plans.read') ||
      p.key === 'subscription.override',
  );
  for (const bp of billingPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: billingAdminRole.id, permissionId: bp.id },
      },
      create: { roleId: billingAdminRole.id, permissionId: bp.id },
      update: {},
    });
  }

  // 2. Admin Super User (Local Development Seed Only)
  const isSeedAdminEnabled =
    process.env.ADMIN_SEED_ENABLED === 'true' ||
    (process.env.ADMIN_SEED_ENABLED !== 'false' && process.env.NODE_ENV !== 'production');

  if (isSeedAdminEnabled) {
    const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@meetingrecorder.local';
    const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'AdminDevPassword2026!';
    const adminPasswordHash = await hashPassword(adminPassword);

    const admin = await prisma.adminUser.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        name: process.env.ADMIN_SEED_NAME || 'Super Administrator',
        passwordHash: adminPasswordHash,
        status: 'ACTIVE',
      },
      update: { passwordHash: adminPasswordHash },
    });

    await prisma.adminUserRole.upsert({
      where: {
        adminUserId_roleId: { adminUserId: admin.id, roleId: superAdminRole.id },
      },
      create: { adminUserId: admin.id, roleId: superAdminRole.id },
      update: {},
    });
    console.log(`   Admin Seed: ${adminEmail} (ADMIN_SEED_ENABLED=${process.env.ADMIN_SEED_ENABLED ?? 'auto'})`);
  } else {
    console.log('   Admin Seed: SKIPPED (ADMIN_SEED_ENABLED=false or production environment)');
  }

  // 3. Plans & Features
  const trialPlan = await prisma.plan.upsert({
    where: { code: 'TRIAL' },
    create: {
      code: 'TRIAL',
      name: 'Free Trial',
      description: '30-day trial with 30 minutes of recording per day',
      billingInterval: 'NONE',
      priceAmount: 0,
      currency: 'USD',
      trialDays: 30,
      dailyRecordingLimitSeconds: 1800,
      active: true,
      sortOrder: 1,
    },
    update: { dailyRecordingLimitSeconds: 1800, trialDays: 30 },
  });

  const silverPlan = await prisma.plan.upsert({
    where: { code: 'SILVER' },
    create: {
      code: 'SILVER',
      name: 'Silver Plan',
      description: 'Unlimited local recording, Google Meet automation, and hardware encoding',
      billingInterval: 'MONTHLY',
      priceAmount: 1900, // $19.00
      currency: 'USD',
      trialDays: 0,
      dailyRecordingLimitSeconds: 0,
      active: true,
      sortOrder: 2,
    },
    update: { priceAmount: 1900 },
  });

  const goldPlan = await prisma.plan.upsert({
    where: { code: 'GOLD' },
    create: {
      code: 'GOLD',
      name: 'Gold Plan',
      description: 'Everything in Silver + modeled entitlements for future AI meeting intelligence and transcription',
      billingInterval: 'MONTHLY',
      priceAmount: 3900, // $39.00
      currency: 'USD',
      trialDays: 0,
      dailyRecordingLimitSeconds: 0,
      active: true,
      sortOrder: 3,
    },
    update: { priceAmount: 3900 },
  });

  const coreFeatures = [
    'recording',
    'googleMeetAutomation',
    'screenCapture',
    'windowCapture',
    'systemAudio',
    'microphone',
    'mp4Output',
    'localRecordingHistory',
  ];

  const aiFeatures = [
    'transcription',
    'speakerDiarization',
    'aiSummary',
    'aiActionItems',
    'aiDecisions',
    'aiKeyInitiatives',
    'aiMeetingNotes',
    'aiBriefing',
    'aiDocumentation',
  ];

  // Configure plan features
  for (const f of coreFeatures) {
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: trialPlan.id, featureKey: f } },
      create: { planId: trialPlan.id, featureKey: f, enabled: true },
      update: { enabled: true },
    });
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: silverPlan.id, featureKey: f } },
      create: { planId: silverPlan.id, featureKey: f, enabled: true },
      update: { enabled: true },
    });
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: goldPlan.id, featureKey: f } },
      create: { planId: goldPlan.id, featureKey: f, enabled: true },
      update: { enabled: true },
    });
  }

  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: trialPlan.id, featureKey: 'unlimitedRecording' } },
    create: { planId: trialPlan.id, featureKey: 'unlimitedRecording', enabled: false },
    update: { enabled: false },
  });

  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: silverPlan.id, featureKey: 'unlimitedRecording' } },
    create: { planId: silverPlan.id, featureKey: 'unlimitedRecording', enabled: true },
    update: { enabled: true },
  });

  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: goldPlan.id, featureKey: 'unlimitedRecording' } },
    create: { planId: goldPlan.id, featureKey: 'unlimitedRecording', enabled: true },
    update: { enabled: true },
  });

  for (const f of aiFeatures) {
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: trialPlan.id, featureKey: f } },
      create: { planId: trialPlan.id, featureKey: f, enabled: false },
      update: { enabled: false },
    });
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: silverPlan.id, featureKey: f } },
      create: { planId: silverPlan.id, featureKey: f, enabled: false },
      update: { enabled: false },
    });
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: goldPlan.id, featureKey: f } },
      create: { planId: goldPlan.id, featureKey: f, enabled: true },
      update: { enabled: true },
    });
  }

  // 4. Seed Standard Test Users
  const userPasswordHash = await hashPassword('UserPassword123!');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // User 1: Active Trial User (10m used today, 20m remaining)
  const trialUser = await prisma.user.upsert({
    where: { email: 'trial@meetingrecorder.local' },
    create: {
      email: 'trial@meetingrecorder.local',
      passwordHash: userPasswordHash,
      displayName: 'Active Trial User',
      emailVerified: true,
      status: 'ACTIVE',
      profile: { create: { timezone: 'America/New_York', language: 'en' } },
      trial: {
        create: {
          startedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      },
      subscriptions: {
        create: {
          planId: trialPlan.id,
          status: 'TRIAL',
          currentPeriodStart: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {},
  });

  await prisma.dailyUsage.upsert({
    where: { userId_usageDate: { userId: trialUser.id, usageDate: todayStr } },
    create: { userId: trialUser.id, usageDate: todayStr, recordingSeconds: 600, recordingCount: 2 },
    update: { recordingSeconds: 600, recordingCount: 2 },
  });

  // User 2: Expired Trial User
  const expiredTrialUser = await prisma.user.upsert({
    where: { email: 'trial.expired@meetingrecorder.local' },
    create: {
      email: 'trial.expired@meetingrecorder.local',
      passwordHash: userPasswordHash,
      displayName: 'Expired Trial User',
      emailVerified: true,
      status: 'ACTIVE',
      profile: { create: { timezone: 'Europe/London', language: 'en' } },
      trial: {
        create: {
          startedAt: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          status: 'EXPIRED',
        },
      },
      subscriptions: {
        create: {
          planId: trialPlan.id,
          status: 'EXPIRED',
          currentPeriodStart: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {},
  });

  // User 3: Trial Limit Reached Today User (1800s used today)
  const limitReachedUser = await prisma.user.upsert({
    where: { email: 'trial.limit@meetingrecorder.local' },
    create: {
      email: 'trial.limit@meetingrecorder.local',
      passwordHash: userPasswordHash,
      displayName: 'Daily Limit Reached User',
      emailVerified: true,
      status: 'ACTIVE',
      profile: { create: { timezone: 'UTC', language: 'en' } },
      trial: {
        create: {
          startedAt: now,
          expiresAt: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      },
      subscriptions: {
        create: {
          planId: trialPlan.id,
          status: 'TRIAL',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {},
  });

  await prisma.dailyUsage.upsert({
    where: { userId_usageDate: { userId: limitReachedUser.id, usageDate: todayStr } },
    create: { userId: limitReachedUser.id, usageDate: todayStr, recordingSeconds: 1800, recordingCount: 3 },
    update: { recordingSeconds: 1800, recordingCount: 3 },
  });

  // User 4: Silver User
  const silverUser = await prisma.user.upsert({
    where: { email: 'silver@meetingrecorder.local' },
    create: {
      email: 'silver@meetingrecorder.local',
      passwordHash: userPasswordHash,
      displayName: 'Silver Subscriber',
      emailVerified: true,
      status: 'ACTIVE',
      profile: { create: { timezone: 'Asia/Tokyo', language: 'ja' } },
      subscriptions: {
        create: {
          planId: silverPlan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      payments: {
        create: {
          amount: 1900,
          currency: 'USD',
          status: 'SUCCEEDED',
        },
      },
      invoices: {
        create: {
          invoiceNumber: 'INV-SILVER-001',
          amountDue: 1900,
          amountPaid: 1900,
          currency: 'USD',
          status: 'PAID',
          periodStart: now,
          periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {},
  });

  // User 5: Gold User
  const goldUser = await prisma.user.upsert({
    where: { email: 'gold@meetingrecorder.local' },
    create: {
      email: 'gold@meetingrecorder.local',
      passwordHash: userPasswordHash,
      displayName: 'Gold Subscriber',
      emailVerified: true,
      status: 'ACTIVE',
      profile: { create: { timezone: 'America/Los_Angeles', language: 'en' } },
      subscriptions: {
        create: {
          planId: goldPlan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      payments: {
        create: {
          amount: 3900,
          currency: 'USD',
          status: 'SUCCEEDED',
        },
      },
      invoices: {
        create: {
          invoiceNumber: 'INV-GOLD-001',
          amountDue: 3900,
          amountPaid: 3900,
          currency: 'USD',
          status: 'PAID',
          periodStart: now,
          periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {},
  });

  // User 6: Past Due User
  await prisma.user.upsert({
    where: { email: 'pastdue@meetingrecorder.local' },
    create: {
      email: 'pastdue@meetingrecorder.local',
      passwordHash: userPasswordHash,
      displayName: 'Past Due Customer',
      emailVerified: true,
      status: 'ACTIVE',
      profile: { create: { timezone: 'Europe/Paris', language: 'fr' } },
      subscriptions: {
        create: {
          planId: silverPlan.id,
          status: 'PAST_DUE',
          currentPeriodStart: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        },
      },
      payments: {
        create: {
          amount: 1900,
          currency: 'USD',
          status: 'FAILED',
          failureReason: 'Card expired',
        },
      },
    },
    update: {},
  });

  // User 7: Cancelled User
  await prisma.user.upsert({
    where: { email: 'cancelled@meetingrecorder.local' },
    create: {
      email: 'cancelled@meetingrecorder.local',
      passwordHash: userPasswordHash,
      displayName: 'Cancelled Customer',
      emailVerified: true,
      status: 'ACTIVE',
      profile: { create: { timezone: 'UTC', language: 'en' } },
      subscriptions: {
        create: {
          planId: silverPlan.id,
          status: 'CANCELLED',
          currentPeriodStart: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          cancelledAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {},
  });

  // Sample recordings for statistics
  const recordingSamples = [
    { title: 'Weekly Product Roadmap Review', platform: 'google_meet', duration: 1820, plan: 'GOLD' },
    { title: 'Frontend Architecture Sync', platform: 'google_meet', duration: 1240, plan: 'SILVER' },
    { title: 'Quick Audio Test Note', platform: 'manual', duration: 180, plan: 'TRIAL' },
    { title: 'Sprint Retrospective', platform: 'google_meet', duration: 2400, plan: 'GOLD' },
  ];

  for (const r of recordingSamples) {
    await prisma.recordingSession.create({
      data: {
        userId: goldUser.id,
        meetingTitle: r.title,
        meetingPlatform: r.platform,
        startedAt: new Date(now.getTime() - Math.floor(Math.random() * 86400000 * 5)),
        endedAt: now,
        durationSeconds: r.duration,
        status: 'COMPLETED',
        authorizationType: r.plan,
        autoStarted: r.platform === 'google_meet',
      },
    });
  }

  console.log('✅ Seed completed successfully!');
  console.log(`   Admin Seeding: ${isSeedAdminEnabled ? 'Configured from environment' : 'Disabled'}`);
  console.log(`   Trial User: trial@meetingrecorder.local / UserPassword123!`);
  console.log(`   Silver User: silver@meetingrecorder.local / UserPassword123!`);
  console.log(`   Gold User: gold@meetingrecorder.local / UserPassword123!`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
