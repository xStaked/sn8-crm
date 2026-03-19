import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import type { KapsoWebhookDto } from './dto/kapso-webhook.dto';
import { WebhooksService } from './webhooks.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isValidKapsoSignature(opts: {
  secret: string;
  signatureHeader: string;
  rawBody: Buffer;
}): boolean {
  const provided = opts.signatureHeader.trim().replace(/^sha256=/i, '');
  const expectedHex = createHmac('sha256', opts.secret).update(opts.rawBody).digest('hex');
  const expectedBase64 = createHmac('sha256', opts.secret).update(opts.rawBody).digest('base64');

  return safeEqual(provided, expectedHex) || safeEqual(provided, expectedBase64);
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('kapso')
  @HttpCode(200)
  async kapsoWebhook(
    @Req() req: RawBodyRequest,
    @Body() payload: KapsoWebhookDto,
    @Headers('x-webhook-signature') signatureHeader: string | undefined,
    @Headers('x-kapso-idempotency-key') idempotencyKeyHeader: string | undefined,
  ) {
    const secret = process.env.KAPSO_WEBHOOK_SECRET;
    if (!secret) {
      // Treat as unauthorized to avoid silently accepting unverified webhooks.
      throw new UnauthorizedException();
    }

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload ?? {}));
    if (!signatureHeader) throw new UnauthorizedException();

    const valid = isValidKapsoSignature({
      secret,
      signatureHeader,
      rawBody,
    });
    if (!valid) throw new UnauthorizedException();

    const result = await this.webhooks.handleKapsoWebhook(payload, idempotencyKeyHeader);
    return { message: 'ok', ...result };
  }
}

