import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import {
  OCR_PROVIDER_TOKEN,
  OcrProvider,
  OcrResult,
} from './providers/ocr-provider.interface';
import {
  buildCountQuota,
  getDailyOcrLimit,
  normalizePlanCode,
} from '../common/plan-limits';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
    @Inject(OCR_PROVIDER_TOKEN)
    private readonly ocrProvider: OcrProvider,
  ) {}

  async getDailyQuota(userId: string) {
    const entitlements = await this.entitlementsService.getEntitlements(userId);
    const plan = normalizePlanCode(entitlements.plan);
    const dailyLimit = getDailyOcrLimit(plan);
    const todayStr = this.entitlementsService.getTodayUtcString();
    const daily = await this.prisma.dailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId,
          usageDate: todayStr,
        },
      },
    });

    const usedToday = daily?.aiRequests || 0;
    const planAllows =
      plan !== 'trial' || Boolean(entitlements.trial && entitlements.trial.active);
    const quota = buildCountQuota(dailyLimit, usedToday, planAllows);

    return {
      today: todayStr,
      plan,
      ...quota,
    };
  }

  async extractText(
    userId: string,
    file?: Express.Multer.File,
    language?: string,
    captureId?: string,
  ): Promise<OcrResult> {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'OCR_NO_FILE',
        message: 'No image file was provided for text extraction.',
      });
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new BadRequestException({
        code: 'OCR_UNSUPPORTED_IMAGE',
        message: `Unsupported file type "${file.mimetype}". Only PNG, JPEG, and WebP images are supported.`,
      });
    }

    if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: 'OCR_FILE_TOO_LARGE',
        message: 'Image size exceeds maximum limit of 10MB.',
      });
    }

    const quota = await this.getDailyQuota(userId);
    if (quota.plan === 'trial' && !quota.allowed && quota.remainingToday > 0) {
      throw new ForbiddenException({
        code: 'TRIAL_EXPIRED',
        message: 'Your 30-day trial has expired. Upgrade to continue using OCR.',
      });
    }
    if (!quota.allowed || quota.remainingToday <= 0) {
      throw new HttpException(
        {
          code: 'OCR_QUOTA_EXCEEDED',
          message: `Daily OCR quota limit (${quota.dailyLimit} extractions) reached for ${quota.plan} plan.`,
          dailyLimit: quota.dailyLimit,
          usedToday: quota.usedToday,
          remainingToday: 0,
          plan: quota.plan,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.logger.log(
      `Processing OCR for user ${userId} (captureId: ${captureId || 'none'}, provider: ${this.ocrProvider.name})`,
    );

    const result = await this.ocrProvider.extractText({
      imageBuffer: file.buffer,
      fileName: file.originalname || 'screenshot.png',
      mimeType: file.mimetype,
      language,
    });

    if (result.status === 'COMPLETED') {
      const todayStr = this.entitlementsService.getTodayUtcString();
      await this.prisma.dailyUsage.upsert({
        where: {
          userId_usageDate: {
            userId,
            usageDate: todayStr,
          },
        },
        create: {
          userId,
          usageDate: todayStr,
          aiRequests: 1,
        },
        update: {
          aiRequests: { increment: 1 },
        },
      });
    }

    return result;
  }
}
