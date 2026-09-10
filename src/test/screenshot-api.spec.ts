import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdInterceptor } from '../common/interceptors/request-id.interceptor';

describe('Screenshot Quota APIs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  const testEmail = `screenshot.quota.${Date.now()}@example.com`;
  const deviceId = 'e2e-screenshot-device-1234';

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

    const signupRes = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: testEmail,
        password: 'Password123!',
        firstName: 'Shot',
        lastName: 'Tester',
        installationId: deviceId,
        deviceName: 'Test Linux Machine',
        platform: 'Linux',
      })
      .expect(201);

    accessToken = signupRes.body.accessToken;
    userId = signupRes.body.user.id;
  });

  afterAll(async () => {
    try {
      if (userId) {
        await prisma.dailyUsage.deleteMany({ where: { userId } });
        await prisma.device.deleteMany({ where: { userId } });
        await prisma.trial.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      }
    } catch {
      // Ignore cleanup error
    }
    await app.close();
  });

  it('should reject unauthenticated screenshot authorize and usage', async () => {
    await request(app.getHttpServer()).post('/v1/screenshots/authorize').expect(401);
    await request(app.getHttpServer()).get('/v1/screenshots/usage').expect(401);
  });

  it('should return trial screenshot quota of 20', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/screenshots/usage')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.plan).toBe('trial');
    expect(res.body.dailyLimit).toBe(20);
    expect(res.body.usedToday).toBe(0);
    expect(res.body.remainingToday).toBe(20);
    expect(res.body.allowed).toBe(true);
  });

  it('should consume one screenshot slot on authorize', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/screenshots/authorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.authorized).toBe(true);
    expect(res.body.plan).toBe('trial');
    expect(res.body.dailyLimit).toBe(20);
    expect(res.body.usedToday).toBe(1);
    expect(res.body.remainingToday).toBe(19);

    const usage = await request(app.getHttpServer())
      .get('/v1/screenshots/usage')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(usage.body.usedToday).toBe(1);
    expect(usage.body.remainingToday).toBe(19);
  });

  it('should return 429 when the daily screenshot quota is exhausted', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    await prisma.dailyUsage.upsert({
      where: {
        userId_usageDate: {
          userId,
          usageDate: todayStr,
        },
      },
      create: {
        userId,
        usageDate: todayStr,
        screenshotCount: 20,
      },
      update: {
        screenshotCount: 20,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/screenshots/authorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(429);

    expect(res.body.error.code).toBe('SCREENSHOT_QUOTA_EXCEEDED');
    expect(res.body.error.dailyLimit).toBe(20);
    expect(res.body.error.plan).toBe('trial');
  });
});
