import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdInterceptor } from '../common/interceptors/request-id.interceptor';
import { Argon2Service } from '../common/argon2.service';

describe('Milestone Gap Completion Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let argon2: Argon2Service;

  let superAdminToken: string;
  let testCustomerToken: string;
  let testCustomerUserId: string;
  const testCustomerEmail = `milestone.gap.${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new RequestIdInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    prisma = app.get(PrismaService);
    argon2 = app.get(Argon2Service);

    // Bootstrap Super Admin login
    const adminLoginRes = await request(app.getHttpServer())
      .post('/v1/admin/auth/login')
      .send({
        email: 'admin@meetingrecorder.local',
        password: 'AdminSecurePassword2026!',
      });

    if (adminLoginRes.status === 200) {
      superAdminToken = adminLoginRes.body.accessToken;
    } else {
      // Create admin if missing
      const passwordHash = await argon2.hash('AdminSecurePassword2026!');
      const admin = await prisma.adminUser.upsert({
        where: { email: 'admin@meetingrecorder.local' },
        update: { passwordHash, status: 'ACTIVE' },
        create: {
          email: 'admin@meetingrecorder.local',
          name: 'Super Admin',
          passwordHash,
          status: 'ACTIVE',
        },
      });

      const superRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
      if (superRole) {
        await prisma.adminUserRole.upsert({
          where: { adminUserId_roleId: { adminUserId: admin.id, roleId: superRole.id } },
          update: {},
          create: { adminUserId: admin.id, roleId: superRole.id },
        });
      }

      const retryRes = await request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({
          email: 'admin@meetingrecorder.local',
          password: 'AdminSecurePassword2026!',
        })
        .expect(200);
      superAdminToken = retryRes.body.accessToken;
    }

    // Create a customer user for testing
    const signupRes = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: testCustomerEmail,
        password: 'CustomerPassword123!',
        firstName: 'Milestone',
        lastName: 'Tester',
        installationId: 'gap-test-device-1',
        deviceName: 'MacBook Pro M3',
        platform: 'macOS',
      })
      .expect(201);

    testCustomerToken = signupRes.body.accessToken;
    testCustomerUserId = signupRes.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Resend Email Verification & Email Verification Flow', () => {
    it('should return safe message when resending for non-existent email (no enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: 'nonexistent-user-12345@example.com' })
        .expect(200);

      expect(res.body.message).toBe('If the account requires verification, a new verification email has been sent.');
    });

    it('should create verification token, invalidate previous token, and enforce rate limiting', async () => {
      // User is currently unverified
      const userBefore = await prisma.user.findUnique({ where: { id: testCustomerUserId } });
      expect(userBefore?.emailVerified).toBe(false);

      // Call 1
      const res1 = await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: testCustomerEmail })
        .expect(200);
      expect(res1.body.message).toBe('If the account requires verification, a new verification email has been sent.');

      const token1 = await prisma.emailVerificationToken.findFirst({
        where: { userId: testCustomerUserId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(token1).toBeDefined();

      // Call 2: should revoke token 1 and create token 2
      const res2 = await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: testCustomerEmail })
        .expect(200);

      const revokedToken1 = await prisma.emailVerificationToken.findUnique({ where: { id: token1!.id } });
      expect(revokedToken1?.revokedAt).not.toBeNull();

      // Call 3
      await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: testCustomerEmail })
        .expect(200);

      // Call 4: should be rate limited with 429 Too Many Requests
      const res4 = await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email: testCustomerEmail })
        .expect(429);

      expect(res4.body.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should verify email with valid token and reject re-use', async () => {
      // Fetch latest active token and assign a known rawToken
      const latestToken = await prisma.emailVerificationToken.findFirst({
        where: { userId: testCustomerUserId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(latestToken).toBeDefined();

      const rawToken = `known-verification-token-${Date.now()}`;
      const crypto = await import('crypto');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await prisma.emailVerificationToken.update({
        where: { id: latestToken!.id },
        data: { tokenHash },
      });

      // Verify email
      const verifyRes = await request(app.getHttpServer())
        .post('/v1/auth/verify-email')
        .send({ token: rawToken })
        .expect(200);

      expect(verifyRes.body.success).toBe(true);

      const updatedUser = await prisma.user.findUnique({ where: { id: testCustomerUserId } });
      expect(updatedUser?.emailVerified).toBe(true);

      // Reusing the same token should fail
      await request(app.getHttpServer())
        .post('/v1/auth/verify-email')
        .send({ token: rawToken })
        .expect(400);
    });
  });

  describe('2. Customer Session Management', () => {
    let secondDeviceId = 'gap-test-device-2';

    beforeAll(async () => {
      // Login with a second device to create another session
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: testCustomerEmail,
          password: 'CustomerPassword123!',
          installationId: secondDeviceId,
          deviceName: 'Windows 11 Workstation',
          platform: 'Windows',
        })
        .expect(200);
    });

    it('should list customer sessions and mark current session', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .expect(200);

      expect(res.body.sessions).toBeDefined();
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(2);

      const current = res.body.sessions.find((s: any) => s.isCurrent === true);
      expect(current).toBeDefined();
      expect(current.platform).toBeDefined();
    });

    it('should revoke a specific session', async () => {
      const sessionsRes = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .expect(200);

      const otherSession = sessionsRes.body.sessions.find((s: any) => s.isCurrent !== true);
      expect(otherSession).toBeDefined();

      const deleteRes = await request(app.getHttpServer())
        .delete(`/v1/auth/sessions/${otherSession.id}`)
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);

      // Verify it is no longer listed
      const verifyRes = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .expect(200);

      expect(verifyRes.body.sessions.some((s: any) => s.id === otherSession.id)).toBe(false);
    });

    it('should terminate all sessions with logout-all', async () => {
      const logoutAllRes = await request(app.getHttpServer())
        .post('/v1/auth/logout-all')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .send({ keepCurrentSession: false })
        .expect(200);

      expect(logoutAllRes.body.success).toBe(true);

      const verifyRes = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .expect(200);

      expect(verifyRes.body.sessions.length).toBe(0);
    });
  });

  describe('3. Customer Dashboard Overview & Backward Compatibility', () => {
    it('should return rich structured customer overview on GET /v1/dashboard/overview', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/dashboard/overview')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.plan).toBeDefined();
      expect(res.body.usage).toBeDefined();
      expect(res.body.recordings).toBeDefined();
      expect(res.body.subscription).toBeDefined();
      expect(res.body.billing).toBeDefined();
      expect(res.body.devices).toBeDefined();
      expect(res.body.entitlements).toBeDefined();
    });

    it('should retain backward compatibility on GET /v1/dashboard', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/dashboard')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .expect(200);

      expect(res.body.plan).toBeDefined();
      expect(res.body.status).toBeDefined();
      expect(res.body.recordingsCount).toBeDefined();
      expect(res.body.usageTodaySeconds).toBeDefined();
    });
  });

  describe('4. Subscription Plan Change Preview', () => {
    it('should preview plan change with proration calculation', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/subscription/change-plan/preview')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .send({ targetPlan: 'GOLD' })
        .expect(200);

      expect(res.body.targetPlan.code).toBe('GOLD');
      expect(res.body.newPriceAmount).toBe(3900);
      expect(res.body.effectiveDate).toBeDefined();
      expect(res.body.nextRenewalDate).toBeDefined();
      expect(res.body.currency).toBe('USD');
    });
  });

  describe('5. Admin Subscription Mutations with Mandatory Reasons & Audit Logs', () => {
    let userSubId: string;

    beforeAll(async () => {
      // Ensure user has a subscription record
      const goldPlan = await prisma.plan.findUnique({ where: { code: 'GOLD' } });
      const sub = await prisma.subscription.create({
        data: {
          userId: testCustomerUserId,
          planId: goldPlan!.id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
      });
      userSubId = sub.id;
    });

    it('should reject mutations without a mandatory reason with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(`/v1/admin/subscriptions/${userSubId}/cancel`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({})
        .expect(400);

      await request(app.getHttpServer())
        .post(`/v1/admin/subscriptions/${userSubId}/extend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ days: 14 })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/v1/admin/subscriptions/${userSubId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' })
        .expect(400);
    });

    it('should execute change-plan, extend, cancel, resume, and status override with audit logging', async () => {
      // 1. Change Plan
      const changePlanRes = await request(app.getHttpServer())
        .post(`/v1/admin/subscriptions/${userSubId}/change-plan`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ targetPlan: 'SILVER', reason: 'Customer downgrade requested via support ticket #102' })
        .expect(200);

      expect(changePlanRes.body.success).toBe(true);

      // 2. Extend
      const extendRes = await request(app.getHttpServer())
        .post(`/v1/admin/subscriptions/${userSubId}/extend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ days: 15, reason: 'Service outage compensation' })
        .expect(200);

      expect(extendRes.body.success).toBe(true);

      // 3. Cancel
      const cancelRes = await request(app.getHttpServer())
        .post(`/v1/admin/subscriptions/${userSubId}/cancel`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Payment repeatedly declined' })
        .expect(200);

      expect(cancelRes.body.success).toBe(true);

      // 4. Resume
      const resumeRes = await request(app.getHttpServer())
        .post(`/v1/admin/subscriptions/${userSubId}/resume`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Customer updated billing method' })
        .expect(200);

      expect(resumeRes.body.success).toBe(true);

      // 5. Override Status
      const statusRes = await request(app.getHttpServer())
        .patch(`/v1/admin/subscriptions/${userSubId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE', reason: 'Executive override for VIP partner' })
        .expect(200);

      expect(statusRes.body.success).toBe(true);
      expect(statusRes.body.subscription.status).toBe('ACTIVE');

      // Verify Audit Logs exist with reasons recorded
      const auditLogs = await prisma.auditLog.findMany({
        where: { entityType: 'SUBSCRIPTION', entityId: userSubId },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(4);
      const reasons = auditLogs.map((l) => (l.metadataJson as any)?.reason);
      expect(reasons).toContain('Customer downgrade requested via support ticket #102');
      expect(reasons).toContain('Service outage compensation');
      expect(reasons).toContain('Payment repeatedly declined');
    });
  });

  describe('6. Granular RBAC Permissions Enforcement', () => {
    let restrictedStaffToken: string;

    beforeAll(async () => {
      // Create a restricted role and staff user with only 'subscriptions.read'
      const restrictedRole = await prisma.role.upsert({
        where: { name: 'VIEW_ONLY_STAFF' },
        update: {},
        create: { name: 'VIEW_ONLY_STAFF', description: 'Read only staff role' },
      });

      const readPerm = await prisma.permission.upsert({
        where: { key: 'subscriptions.read' },
        update: {},
        create: { key: 'subscriptions.read', description: 'Read subscriptions' },
      });

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: restrictedRole.id, permissionId: readPerm.id } },
        update: {},
        create: { roleId: restrictedRole.id, permissionId: readPerm.id },
      });

      const staffPasswordHash = await argon2.hash('StaffPass2026!');
      const staffUser = await prisma.adminUser.upsert({
        where: { email: 'staff.restricted@meetingrecorder.local' },
        update: { passwordHash: staffPasswordHash },
        create: {
          email: 'staff.restricted@meetingrecorder.local',
          name: 'Restricted Staff',
          passwordHash: staffPasswordHash,
          status: 'ACTIVE',
        },
      });

      await prisma.adminUserRole.upsert({
        where: { adminUserId_roleId: { adminUserId: staffUser.id, roleId: restrictedRole.id } },
        update: {},
        create: { adminUserId: staffUser.id, roleId: restrictedRole.id },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({
          email: 'staff.restricted@meetingrecorder.local',
          password: 'StaffPass2026!',
        })
        .expect(200);

      restrictedStaffToken = loginRes.body.accessToken;
    });

    it('should allow restricted staff to read subscriptions', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/subscriptions')
        .set('Authorization', `Bearer ${restrictedStaffToken}`)
        .expect(200);
    });

    it('should deny restricted staff from mutating subscriptions with 403 Forbidden', async () => {
      const subs = await prisma.subscription.findMany({ take: 1 });
      const targetSubId = subs[0].id;

      const res = await request(app.getHttpServer())
        .post(`/v1/admin/subscriptions/${targetSubId}/change-plan`)
        .set('Authorization', `Bearer ${restrictedStaffToken}`)
        .send({ targetPlan: 'GOLD', reason: 'Unauthorized attempt' })
        .expect(403);

      expect(res.body.error?.code).toBe('FORBIDDEN');
    });
  });

  describe('7. Admin Plan Management & Deletion Protection', () => {
    let createdPlanId: string;
    const customCode = `TEST_PLAN_${Date.now()}`;

    it('should create and update a new plan', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/admin/plans')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: customCode,
          name: 'Custom Test Plan',
          description: 'Special custom test plan',
          priceAmount: 4900,
          billingInterval: 'MONTHLY',
          dailyRecordingLimitSeconds: 7200,
          trialDays: 14,
          active: true,
        })
        .expect(201);

      expect(createRes.body.code).toBe(customCode);
      createdPlanId = createRes.body.id;

      // Update plan
      const updateRes = await request(app.getHttpServer())
        .patch(`/v1/admin/plans/${createdPlanId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Updated Custom Plan', priceAmount: 5500 })
        .expect(200);

      expect(updateRes.body.name).toBe('Updated Custom Plan');
      expect(updateRes.body.priceAmount).toBe(5500);
    });

    it('should deactivate and activate plan', async () => {
      await request(app.getHttpServer())
        .post(`/v1/admin/plans/${createdPlanId}/deactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      let plan = await prisma.plan.findUnique({ where: { id: createdPlanId } });
      expect(plan?.active).toBe(false);

      await request(app.getHttpServer())
        .post(`/v1/admin/plans/${createdPlanId}/activate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      plan = await prisma.plan.findUnique({ where: { id: createdPlanId } });
      expect(plan?.active).toBe(true);
    });

    it('should prevent deleting a plan when active subscriptions exist', async () => {
      const silverPlan = await prisma.plan.findUnique({ where: { code: 'SILVER' } });
      expect(silverPlan).toBeDefined();

      // Ensure at least one subscription uses SILVER
      await prisma.subscription.create({
        data: {
          userId: testCustomerUserId,
          planId: silverPlan!.id,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/v1/admin/plans/${silverPlan!.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(400);

      expect(res.body.error?.code).toBe('PLAN_IN_USE');
    });

    it('should delete unattached plan', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/admin/plans/${createdPlanId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('8. Admin Health Aggregation & Deep Endpoints', () => {
    it('should return aggregated system health with all required services', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/health')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.status).toBeDefined();
      expect(res.body.services.database).toBeDefined();
      expect(res.body.services.billing).toBeDefined();
      expect(res.body.services.email).toBeDefined();
      expect(res.body.services.jobs).toBeDefined();
      expect(res.body.services.webhooks).toBeDefined();
      expect(res.body.services.auth).toBeDefined();
      expect(res.body.services.recordingAuthorization).toBeDefined();
    });

    it('should respond on deep health endpoints', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/health/database')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/v1/admin/health/billing')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/v1/admin/health/jobs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/v1/admin/health/webhooks')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  describe('9. Billing Simulator Disablement', () => {
    it('should return 403 Forbidden when ENABLE_BILLING_SIMULATOR is disabled', async () => {
      const originalEnv = process.env.ENABLE_BILLING_SIMULATOR;
      process.env.ENABLE_BILLING_SIMULATOR = 'false';

      try {
        const res = await request(app.getHttpServer())
          .post('/v1/webhooks/simulator')
          .send({ type: 'invoice.paid', data: {} })
          .expect(403);

        expect(res.body.error?.code).toBe('SIMULATOR_DISABLED');
      } finally {
        process.env.ENABLE_BILLING_SIMULATOR = originalEnv;
      }
    });
  });
});
