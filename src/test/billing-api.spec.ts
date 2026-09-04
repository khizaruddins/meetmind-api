import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdInterceptor } from '../common/interceptors/request-id.interceptor';

describe('Billing, Subscriptions & Webhooks (Milestone 7)', () => {
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

  let customerToken: string;
  let customerId: string;

  beforeAll(async () => {
    const signupRes = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: `billing.tester.${Date.now()}@example.com`,
        password: 'Password123!',
      })
      .expect(201);

    customerToken = signupRes.body.accessToken;
    customerId = signupRes.body.user.id;
  });

  describe('Customer Subscription Lifecycle (Section 16)', () => {
    it('should create checkout session for plan upgrade', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/subscription/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ planCode: 'SILVER' })
        .expect(201);

      expect(res.body.sessionId).toBeDefined();
      expect(res.body.url).toBeDefined();
    });

    it('should upgrade customer from Trial to Silver', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/subscription/change-plan')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ planCode: 'SILVER' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.plan.code).toBe('SILVER');

      // Verify invoice generated
      const invRes = await request(app.getHttpServer())
        .get('/v1/invoices')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(invRes.body.invoices.length).toBeGreaterThanOrEqual(1);
    });

    it('should upgrade customer from Silver to Gold', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/subscription/change-plan')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ planCode: 'GOLD' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.plan.code).toBe('GOLD');
    });

    it('should schedule cancellation at period end', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/subscription/cancel')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ atPeriodEnd: true })
        .expect(200);

      expect(res.body.cancelAtPeriodEnd).toBe(true);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('should resume pending cancelled subscription', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/subscription/resume')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.cancelAtPeriodEnd).toBe(false);
      expect(res.body.cancelledAt).toBeNull();
    });

    it('should list payment methods and set default', async () => {
      const setupRes = await request(app.getHttpServer())
        .post('/v1/payment-methods/setup')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(201);

      expect(setupRes.body.id).toBeDefined();

      const listRes = await request(app.getHttpServer())
        .get('/v1/payment-methods')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(listRes.body.paymentMethods.length).toBeGreaterThan(0);
    });
  });

  describe('Billing Webhooks & Idempotency (Section 21)', () => {
    it('should process webhook event and prevent duplicate processing', async () => {
      const eventId = `evt_test_${Date.now()}`;
      const payload = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: {
              userId: customerId,
              planCode: 'GOLD',
            },
          },
        },
      };

      // First delivery
      const res1 = await request(app.getHttpServer())
        .post('/v1/webhooks/billing')
        .set('x-webhook-signature', 'valid_test_sig')
        .send(payload)
        .expect(200);

      expect(res1.body.received).toBe(true);

      // Duplicate delivery (idempotency check)
      const res2 = await request(app.getHttpServer())
        .post('/v1/webhooks/billing')
        .set('x-webhook-signature', 'valid_test_sig')
        .send(payload)
        .expect(200);

      expect(res2.body.received).toBe(true);
      expect(res2.body.alreadyProcessed).toBe(true);
    });
  });
});
