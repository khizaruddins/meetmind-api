import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OcrService } from './ocr.service';

@ApiTags('OCR')
@Controller('v1/ocr')
@UseGuards(CustomerJwtAuthGuard)
@ApiBearerAuth()
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('extract')
  @ApiOperation({
    summary: 'Extract text from an uploaded screenshot via OCR provider',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Screenshot image file (PNG, JPEG, WebP, max 10MB)',
        },
        language: {
          type: 'string',
          description: '3-letter language code (e.g. eng, spa, fre, ger, chs, auto)',
          default: 'eng',
        },
        captureId: {
          type: 'string',
          description: 'Optional local capture ID for correlation',
        },
      },
      required: ['image'],
    },
  })
  @UseInterceptors(FileInterceptor('image'))
  async extractText(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('language') language?: string,
    @Body('captureId') captureId?: string,
  ) {
    return this.ocrService.extractText(user.id, file, language, captureId);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get current daily OCR usage and remaining quota' })
  async getUsage(@CurrentUser() user: any) {
    return this.ocrService.getDailyQuota(user.id);
  }
}
