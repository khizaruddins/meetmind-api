import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import {
  OCR_PROVIDER_TOKEN,
  OcrProvider,
} from './providers/ocr-provider.interface';
import { OcrSpaceProvider } from './providers/ocr-space.provider';
import { MockOcrProvider } from './providers/mock-ocr.provider';

@Module({
  imports: [JwtModule.register({})],
  controllers: [OcrController],
  providers: [
    PrismaService,
    CustomerJwtAuthGuard,
    EntitlementsService,
    OcrService,
    OcrSpaceProvider,
    MockOcrProvider,
    {
      provide: OCR_PROVIDER_TOKEN,
      useFactory: (
        configService: ConfigService,
        ocrSpaceProvider: OcrSpaceProvider,
        mockOcrProvider: MockOcrProvider,
      ): OcrProvider => {
        const providerName = (
          configService.get<string>('OCR_PROVIDER') || 'ocr_space'
        ).toLowerCase();

        if (providerName === 'mock') {
          return mockOcrProvider;
        }
        return ocrSpaceProvider;
      },
      inject: [ConfigService, OcrSpaceProvider, MockOcrProvider],
    },
  ],
  exports: [OcrService, OCR_PROVIDER_TOKEN],
})
export class OcrModule {}
