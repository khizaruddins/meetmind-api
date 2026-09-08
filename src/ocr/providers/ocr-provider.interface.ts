export interface OcrInput {
  imageBuffer: Buffer;
  fileName: string;
  mimeType: string;
  language?: string;
}

export interface OcrResult {
  status: 'COMPLETED' | 'FAILED';
  text: string;
  language?: string;
  provider: string;
  processingMs: number;
  errorCode?: string;
  message?: string;
}

export interface OcrProvider {
  readonly name: string;
  extractText(input: OcrInput): Promise<OcrResult>;
}

export const OCR_PROVIDER_TOKEN = 'OCR_PROVIDER_TOKEN';
