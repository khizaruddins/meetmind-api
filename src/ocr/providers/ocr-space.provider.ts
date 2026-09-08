import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrInput, OcrProvider, OcrResult } from './ocr-provider.interface';

@Injectable()
export class OcrSpaceProvider implements OcrProvider {
  readonly name = 'OCR Engine';
  private readonly logger = new Logger(OcrSpaceProvider.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs = 25000;

  private readonly ocrEngine: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl =
      this.configService.get<string>('OCR_SPACE_BASE_URL') ||
      'https://api.ocr.space/parse/image';
    this.apiKey =
      this.configService.get<string>('OCR_SPACE_API_KEY') || 'helloworld';
    this.ocrEngine =
      this.configService.get<string>('OCR_SPACE_ENGINE') || '3';
  }

  async extractText(input: OcrInput): Promise<OcrResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const formData = new FormData();
      formData.append('apikey', this.apiKey);

      const blob = new Blob([new Uint8Array(input.imageBuffer)], {
        type: input.mimeType || 'image/png',
      });
      formData.append('file', blob, input.fileName || 'screenshot.png');

      const lang = (input.language || 'eng').trim().toLowerCase();
      formData.append('language', lang);
      formData.append('OCREngine', this.ocrEngine);
      formData.append('scale', 'true');
      formData.append('detectOrientation', 'true');
      formData.append('isOverlayRequired', 'false');

      this.logger.log(
        `Sending OCR request to ${this.apiUrl} (engine: ${this.ocrEngine}, fileSize: ${input.imageBuffer.length} bytes, lang: ${lang})`,
      );

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          apikey: this.apiKey,
        },
        body: formData,
        signal: controller.signal,
      });

      const processingMs = Date.now() - startTime;

      if (response.status === 429) {
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_RATE_LIMITED',
          message: 'OCR rate limit exceeded. Please try again shortly.',
        };
      }

      if (response.status === 413) {
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_FILE_TOO_LARGE',
          message: 'Image size exceeds OCR provider maximum limit.',
        };
      }

      if (!response.ok) {
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_PROVIDER_UNAVAILABLE',
          message: `OCR provider returned HTTP ${response.status}`,
        };
      }

      const json = await response.json();

      const ocrExitCode = Number(json.OCRExitCode);
      const isErrored = Boolean(json.IsErroredOnProcessing);

      if (isErrored || ocrExitCode === 4) {
        const errorMsg =
          json.ErrorMessage ||
          json.ErrorDetails ||
          'OCR processing failed on server.';
        this.logger.warn(`OCR.space returned error: ${JSON.stringify(errorMsg)}`);
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_FAILED',
          message: Array.isArray(errorMsg) ? errorMsg.join('; ') : String(errorMsg),
        };
      }

      const parsedResults = json.ParsedResults;
      if (!parsedResults || !Array.isArray(parsedResults) || parsedResults.length === 0) {
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_NO_TEXT_FOUND',
          message: 'No text results returned from OCR provider.',
        };
      }

      const firstPage = parsedResults[0];
      const pageExitCode = Number(firstPage.FileParseExitCode);

      if (pageExitCode === -20) {
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_PROVIDER_TIMEOUT',
          message: 'OCR provider timed out while parsing image.',
        };
      }

      if (pageExitCode === -30) {
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_FILE_TOO_LARGE',
          message:
            firstPage.ErrorMessage ||
            'Image exceeds OCR file size or validation constraints.',
        };
      }

      if (pageExitCode === -10 || (pageExitCode !== 1 && ocrExitCode === 3)) {
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_FAILED',
          message: firstPage.ErrorMessage || 'OCR engine could not parse text from this image.',
        };
      }

      const rawText = (firstPage.ParsedText || '').replace(/\r\n/g, '\n').trim();

      if (!rawText) {
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

      this.logger.log(
        `OCR extraction succeeded (${rawText.length} chars, ${processingMs}ms)`,
      );

      return {
        status: 'COMPLETED',
        text: rawText,
        language: lang,
        provider: this.name,
        processingMs: json.ProcessingTimeInMilliseconds
          ? parseInt(json.ProcessingTimeInMilliseconds, 10) || processingMs
          : processingMs,
      };
    } catch (err: any) {
      const processingMs = Date.now() - startTime;
      if (err.name === 'AbortError' || controller.signal.aborted) {
        this.logger.error('OCR request timed out after 25s');
        return {
          status: 'FAILED',
          text: '',
          provider: this.name,
          processingMs,
          errorCode: 'OCR_PROVIDER_TIMEOUT',
          message: 'OCR request timed out after 25 seconds.',
        };
      }

      this.logger.error(`OCR request failed: ${err.message}`);
      return {
        status: 'FAILED',
        text: '',
        provider: this.name,
        processingMs,
        errorCode: 'OCR_PROVIDER_UNAVAILABLE',
        message: 'Network error communicating with OCR provider.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
