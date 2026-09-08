import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdInterceptor } from '../common/interceptors/request-id.interceptor';
import { OCR_PROVIDER_TOKEN } from '../ocr/providers/ocr-provider.interface';
import { MockOcrProvider } from '../ocr/providers/mock-ocr.provider';

describe('OCR Platform APIs (Milestone V2.3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  const testEmail = `ocr.test.${Date.now()}@example.com`;
  const deviceId = 'e2e-ocr-device-1234';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OCR_PROVIDER_TOKEN)
      .useClass(MockOcrProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new RequestIdInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    prisma = app.get(PrismaService);

    // Create a customer user for testing
    const signupRes = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: testEmail,
        password: 'Password123!',
        firstName: 'Ocr',
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

  describe('Security & Authentication', () => {
    it('should reject unauthenticated GET /v1/ocr/usage with 401', async () => {
      await request(app.getHttpServer())
        .get('/v1/ocr/usage')
        .expect(401);
    });

    it('should reject unauthenticated POST /v1/ocr/extract with 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/ocr/extract')
        .expect(401);
    });
  });

  describe('Usage & Quotas', () => {
    it('should return initial daily quota for customer (trial = 10)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ocr/usage')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.dailyLimit).toBe(10);
      expect(res.body.usedToday).toBe(0);
      expect(res.body.remainingToday).toBe(10);
      expect(res.body.plan).toBe('trial');
    });
  });

  describe('File Validation', () => {
    it('should reject extraction request when no file is provided (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/ocr/extract')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.error.code).toBe('OCR_NO_FILE');
    });

    it('should reject unsupported file types like text/plain (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/ocr/extract')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('image', Buffer.from('hello world plain text'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      expect(res.body.error.code).toBe('OCR_UNSUPPORTED_IMAGE');
    });
  });

  describe('Text Extraction Flow', () => {
    it('should successfully extract text from valid PNG screenshot', async () => {
      // 1x1 PNG sample buffer
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await request(app.getHttpServer())
        .post('/v1/ocr/extract')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('image', pngBuffer, {
          filename: 'screenshot.png',
          contentType: 'image/png',
        })
        .field('language', 'eng')
        .field('captureId', 'cap-test-123')
        .expect(201);

      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.text).toContain('MeetMind OCR Test');
      expect(res.body.language).toBe('eng');
      expect(res.body.provider).toBe('mock');
      expect(res.body.processingMs).toBeGreaterThan(0);
    });

    it('should record usage after successful extraction', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/ocr/usage')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.usedToday).toBe(1);
      expect(res.body.remainingToday).toBe(9);
    });

    it('should handle provider timeout gracefully with status FAILED', async () => {
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await request(app.getHttpServer())
        .post('/v1/ocr/extract')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('image', pngBuffer, {
          filename: 'error_timeout_screenshot.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(res.body.status).toBe('FAILED');
      expect(res.body.errorCode).toBe('OCR_PROVIDER_TIMEOUT');
    });

    it('should enforce daily quota and return 429 when exhausted', async () => {
      // Artificially set aiRequests to 10 in dailyUsage
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
          aiRequests: 10,
        },
        update: {
          aiRequests: 10,
        },
      });

      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await request(app.getHttpServer())
        .post('/v1/ocr/extract')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('image', pngBuffer, {
          filename: 'screenshot.png',
          contentType: 'image/png',
        })
        .expect(429);

      expect(res.body.error.code).toBe('OCR_QUOTA_EXCEEDED');
    });
  });
});
