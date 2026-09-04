import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdInterceptor } from '../common/interceptors/request-id.interceptor';

describe('Admin Suite & RBAC APIs (Milestone 7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  let superAdminToken: string;
  let testUserId: string;

  describe('Admin Authentication & RBAC (Section 23, 24)', () => {
    it('should reject unauthenticated requests to admin endpoints with 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/admin/dashboard').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should login super admin successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({
          email: 'admin@meetingrecorder.local',
          password: 'AdminSecurePassword2026!',
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.admin.roles).toContain('SUPER_ADMIN');
      superAdminToken = res.body.accessToken;
    });

    it('should get authenticated admin info on /v1/admin/auth/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/auth/me')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.email).toBe('admin@meetingrecorder.local');
      expect(res.body.roles).toContain('SUPER_ADMIN');
    });
  });

  describe('Admin User Management (Section 25, 26, 63)', () => {
    it('should create dedicated user and list/filter users with pagination', async () => {
      const userRes = await request(app.getHttpServer())
        .post('/v1/admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: `admin.test.${Date.now()}@example.com`,
          password: 'Password123!',
          firstName: 'AdminTest',
          lastName: 'Target',
        })
        .expect(201);

      testUserId = userRes.body.id;

      const res = await request(app.getHttpServer())
        .get('/v1/admin/users?page=1&limit=10')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.pagination).toBeDefined();
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should get 360-degree customer overview on /v1/admin/users/:id/overview', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/admin/users/${testUserId}/overview`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.profile).toBeDefined();
      expect(res.body.currentPlan).toBeDefined();
      expect(res.body.recordingStatistics).toBeDefined();
      expect(res.body.billingSummary).toBeDefined();
    });

    it('should get chronological timeline on /v1/admin/users/:id/timeline', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/admin/users/${testUserId}/timeline`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.timeline).toBeDefined();
      expect(Array.isArray(res.body.timeline)).toBe(true);
    });

    it('should support internal support notes CRUD', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/v1/admin/users/${testUserId}/notes`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ note: 'Customer contacted support regarding meeting audio' })
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.note).toContain('meeting audio');

      const listRes = await request(app.getHttpServer())
        .get(`/v1/admin/users/${testUserId}/notes`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(listRes.body.notes.length).toBeGreaterThan(0);
    });

    it('should disable and enable user account', async () => {
      await request(app.getHttpServer())
        .post(`/v1/admin/users/${testUserId}/disable`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/admin/users/${testUserId}/enable`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  describe('Admin Trial Management (Section 27)', () => {
    it('should extend user trial and reset daily usage with audit logs', async () => {
      const extendRes = await request(app.getHttpServer())
        .post(`/v1/admin/users/${testUserId}/trial/extend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ days: 14, reason: 'VIP Evaluation' })
        .expect(200);

      expect(extendRes.body.extendedDays).toBeGreaterThanOrEqual(14);

      const resetRes = await request(app.getHttpServer())
        .post(`/v1/admin/users/${testUserId}/trial/reset-daily-usage`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(resetRes.body.success).toBe(true);
    });
  });

  describe('Admin Subscriptions & Revenue Metrics (Section 28, 33)', () => {
    it('should retrieve executive subscription metrics (MRR, ARR, active counts)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/subscription-metrics')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.mrr).toBeGreaterThanOrEqual(0);
      expect(res.body.arr).toBeGreaterThanOrEqual(0);
      expect(res.body.activeSubscriptions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Admin Plan CRUD (Section 29)', () => {
    it('should list plans and prevent deleting a plan actively used by subscriptions', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/v1/admin/plans')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const silverPlan = listRes.body.plans.find((p: any) => p.code === 'SILVER');
      expect(silverPlan).toBeDefined();

      // Deleting active plan should be rejected with 400
      const delRes = await request(app.getHttpServer())
        .delete(`/v1/admin/plans/${silverPlan.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(400);

      expect(delRes.body.error.code).toBe('PLAN_IN_USE');
    });
  });

  describe('Admin Dashboard & System Health (Section 37, 38, 39)', () => {
    it('should return complete Admin Dashboard KPIs', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/dashboard')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.totalUsers).toBeGreaterThan(0);
      expect(res.body.activeSubscriptions).toBeDefined();
      expect(res.body.mrr).toBeDefined();
      expect(res.body.currentServiceHealth).toBe('HEALTHY');
    });

    it('should return public health probe', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('should return system health checks for database, billing, email, queue', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/health')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.status).toBe('HEALTHY');
      expect(res.body.services.database.status).toBe('HEALTHY');
      expect(res.body.services.billing.status).toBe('HEALTHY');
    });
  });

  describe('Admin Audit Logs (Section 36)', () => {
    it('should query recorded administrative audit logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].actorType).toBe('ADMIN');
    });
  });
});
