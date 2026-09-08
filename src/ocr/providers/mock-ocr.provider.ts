import { Injectable } from '@nestjs/common';
import { OcrInput, OcrProvider, OcrResult } from './ocr-provider.interface';

@Injectable()
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';

  async extractText(input: OcrInput): Promise<OcrResult> {
    const processingMs = 45;
    const lang = input.language || 'eng';

    // Check if filename or test triggers error behavior
    if (input.fileName?.includes('error_timeout')) {
      return {
        status: 'FAILED',
        text: '',
        provider: this.name,
        processingMs: 25000,
        errorCode: 'OCR_PROVIDER_TIMEOUT',
        message: 'OCR provider timed out.',
      };
    }

    if (input.fileName?.includes('error_empty')) {
      return {
        status: 'FAILED',
        text: '',
        language: lang,
        provider: this.name,
        processingMs,
        errorCode: 'OCR_NO_TEXT_FOUND',
        message: 'No legible text was detected in the screenshot.',
      };
    }

    return {
      status: 'COMPLETED',
      text: 'MeetMind OCR Test\nBuild version: 2.3\nERROR_CODE_12345',
      language: lang,
      provider: this.name,
      processingMs,
    };
  }
}
