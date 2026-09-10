import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestIdInterceptor } from '../common/interceptors/request-id.interceptor';

describe('Customer Platform APIs (Milestone 7)', () => {
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

  const testEmail = `test.user.${Date.now()}@example.com`;
  let accessToken: string;
  let refreshToken: string;
  let deviceId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  describe('Customer Authentication (Section 4)', () => {
    it('should successfully signup and create 30-day Trial', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: testEmail,
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'Customer',
          installationId: deviceId,
          deviceName: 'Ubuntu Linux 24.04',
          platform: 'Linux',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.trial).toBeDefined();
      expect(res.body.user.trial.status).toBe('ACTIVE');

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should reject duplicate signup with 409 CONFLICT', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: testEmail,
          password: 'Password123!',
        })
        .expect(409);

      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should reject invalid password with 401 UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword!',
        })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should login successfully with correct password', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: testEmail,
          password: 'Password123!',
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should rotate refresh token on /v1/auth/refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(refreshToken);

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('should get current user on /v1/auth/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(testEmail);
      expect(res.body.profile).toBeDefined();
    });
  });

  describe('Entitlements & Daily Quotas (Section 10, 15)', () => {
    it('should return Trial entitlements with 1800s daily quota and no AI flags', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/me/entitlements')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.plan).toBe('trial');
      expect(res.body.trial.active).toBe(true);
      expect(res.body.trial.daysRemaining).toBeGreaterThanOrEqual(29);
      expect(res.body.recording.allowed).toBe(true);
      expect(res.body.recording.dailyLimitSeconds).toBe(1800);
      expect(res.body.features.recording).toBe(true);
      expect(res.body.features.unlimitedRecording).toBe(false);
      expect(res.body.features.transcription).toBe(false);
      expect(res.body.features.aiSummary).toBe(false);
      expect(res.body.screenshots.dailyLimit).toBe(20);
      expect(res.body.screenshots.usedToday).toBe(0);
      expect(res.body.screenshots.remainingToday).toBe(20);
      expect(res.body.ocr.dailyLimit).toBe(20);
      expect(res.body.ocr.usedToday).toBe(0);
      expect(res.body.ocr.remainingToday).toBe(20);
    });

    it('should authorize recording and return maxDurationSeconds', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/recordings/authorize')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          meetingPlatform: 'google_meet',
          meetingTitle: 'Test Sprint Review',
        })
        .expect(200);

      expect(res.body.authorized).toBe(true);
      expect(res.body.recordingSessionId).toBeDefined();
      expect(res.body.maxDurationSeconds).toBeLessThanOrEqual(1800);
      expect(res.body.plan).toBe('trial');

      // Heartbeat
      const hbRes = await request(app.getHttpServer())
        .post(`/v1/recordings/${res.body.recordingSessionId}/heartbeat`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ elapsedDurationSeconds: 60 })
        .expect(200);

      expect(hbRes.body.ok).toBe(true);

      // Complete session
      const compRes = await request(app.getHttpServer())
        .post(`/v1/recordings/${res.body.recordingSessionId}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ durationSeconds: 60 })
        .expect(200);

      expect(compRes.body.success).toBe(true);
      expect(compRes.body.finalDurationSeconds).toBe(60);
    });

    it('should reflect 60 seconds used in today usage endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/usage/today')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.today.recordingSeconds).toBe(60);
      expect(res.body.today.remainingSeconds).toBe(1740);
    });

    it('should deny authorization when user quota is exhausted', async () => {
      // Login as trial.limit user seeded with 1800s used today
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'trial.limit@meetingrecorder.local',
          password: 'UserPassword123!',
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/v1/recordings/authorize')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({ meetingPlatform: 'manual' })
        .expect(403);

      expect(res.body.error.code).toBe('TRIAL_DAILY_LIMIT_REACHED');
    });

    it('should deny authorization when trial is expired', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'trial.expired@meetingrecorder.local',
          password: 'UserPassword123!',
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/v1/recordings/authorize')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({ meetingPlatform: 'manual' })
        .expect(403);

      expect(res.body.error.code).toBe('TRIAL_EXPIRED');
    });
  });

  describe('Paid Plans & Offline License Cache (Section 10, 49)', () => {
    it('should authorize unlimited recording and provide HMAC signed offline cache for Silver user', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'silver@meetingrecorder.local',
          password: 'UserPassword123!',
        })
        .expect(200);

      const entRes = await request(app.getHttpServer())
        .get('/v1/me/entitlements')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      expect(entRes.body.plan).toBe('silver');
      expect(entRes.body.recording.allowed).toBe(true);
      expect(entRes.body.recording.dailyLimitSeconds).toBeNull();
      expect(entRes.body.screenshots.dailyLimit).toBe(50);
      expect(entRes.body.ocr.dailyLimit).toBe(50);
      expect(entRes.body.features.unlimitedRecording).toBe(true);
      expect(entRes.body.features.transcription).toBe(false);
      expect(entRes.body.offlineLicense).toBeDefined();
      expect(entRes.body.offlineLicense.signature).toBeDefined();

      const authRes = await request(app.getHttpServer())
        .post('/v1/recordings/authorize')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({ meetingPlatform: 'google_meet' })
        .expect(200);

      expect(authRes.body.authorized).toBe(true);
      expect(authRes.body.maxDurationSeconds).toBeNull();
      expect(authRes.body.plan).toBe('silver');
    });

    it('should expose modeled AI capability entitlements for Gold user', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'gold@meetingrecorder.local',
          password: 'UserPassword123!',
        })
        .expect(200);

      const entRes = await request(app.getHttpServer())
        .get('/v1/me/entitlements')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      expect(entRes.body.plan).toBe('gold');
      expect(entRes.body.screenshots.dailyLimit).toBe(80);
      expect(entRes.body.ocr.dailyLimit).toBe(80);
      expect(entRes.body.features.unlimitedRecording).toBe(true);
      expect(entRes.body.features.transcription).toBe(true);
      expect(entRes.body.features.speakerDiarization).toBe(true);
      expect(entRes.body.features.aiSummary).toBe(true);
      expect(entRes.body.features.aiActionItems).toBe(true);
      expect(entRes.body.features.aiMeetingNotes).toBe(true);
    });
  });

  describe('Customer Dashboard (Section 22)', () => {
    it('should return complete customer dashboard stats', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.plan).toBe('trial');
      expect(res.body.trialDaysRemaining).toBeGreaterThanOrEqual(29);
      expect(res.body.recordingsToday).toBeGreaterThanOrEqual(1);
      expect(res.body.recordingMinutesRemainingToday).toBeGreaterThan(0);
    });
  });
});
