import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_PDF_LINK_TTL_SECONDS = 24 * 60 * 60;
const PDF_LINK_PURPOSE = 'quote-review-pdf-v1';

type PdfLinkValidationResult =
  | { ok: true; expiresAtUnix: number }
  | { ok: false; reason: string };

@Injectable()
export class QuotePdfAccessLinkService {
  constructor(private readonly config: ConfigService) {}

  buildSignedPublicQuotePdfUrl(conversationId: string): {
    url: string;
    expiresAtUnix: number;
  } {
    const normalizedConversationId = conversationId.trim();
    const ttlSeconds = this.getTtlSeconds();
    const expiresAtUnix = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = this.sign(normalizedConversationId, expiresAtUnix);
    const baseUrl =
      this.config.get<string>('CRM_BASE_URL')?.trim() || 'https://crm.sn8labs.com';

    return {
      url: `${baseUrl}/public/conversations/${encodeURIComponent(
        normalizedConversationId,
      )}/quote-review/pdf?exp=${expiresAtUnix}&sig=${encodeURIComponent(signature)}`,
      expiresAtUnix,
    };
  }

  validatePublicQuotePdfUrlSignature(input: {
    conversationId: string;
    expiresAtRaw: string | undefined;
    signature: string | undefined;
  }): PdfLinkValidationResult {
    if (!input.signature) {
      return { ok: false, reason: 'missing_signature' };
    }

    if (!input.expiresAtRaw) {
      return { ok: false, reason: 'missing_expiration' };
    }

    const expiresAtUnix = Number.parseInt(input.expiresAtRaw, 10);
    if (!Number.isFinite(expiresAtUnix)) {
      return { ok: false, reason: 'invalid_expiration' };
    }

    if (expiresAtUnix <= Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: 'expired' };
    }

    const expected = this.sign(input.conversationId.trim(), expiresAtUnix);
    if (!this.safeEquals(expected, input.signature)) {
      return { ok: false, reason: 'invalid_signature' };
    }

    return { ok: true, expiresAtUnix };
  }

  private sign(conversationId: string, expiresAtUnix: number): string {
    const secret = this.getSigningSecret();
    const payload = `${PDF_LINK_PURPOSE}:${conversationId}:${expiresAtUnix}`;
    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  private safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private getSigningSecret(): string {
    const value =
      this.config.get<string>('QUOTE_PDF_PUBLIC_LINK_SECRET')?.trim() ||
      this.config.get<string>('JWT_SECRET')?.trim();

    if (!value) {
      throw new Error(
        'QUOTE_PDF_PUBLIC_LINK_SECRET (or JWT_SECRET fallback) is required to sign quote PDF public links.',
      );
    }

    return value;
  }

  private getTtlSeconds(): number {
    const raw = this.config.get<string>('QUOTE_PDF_PUBLIC_LINK_TTL_SECONDS')?.trim();
    if (!raw) {
      return DEFAULT_PDF_LINK_TTL_SECONDS;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_PDF_LINK_TTL_SECONDS;
    }

    return parsed;
  }
}
