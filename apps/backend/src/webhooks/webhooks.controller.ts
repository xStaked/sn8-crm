import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import type { KapsoWebhookDto } from './dto/kapso-webhook.dto';
import {
  KapsoWebhookDocDto,
  KapsoWebhookDuplicateResponseDto,
  KapsoWebhookEnqueuedResponseDto,
  KapsoWebhookIgnoredResponseDto,
} from './dto/kapso-webhook-doc.dto';
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
@ApiTags('Webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooks: WebhooksService) {}

  @ApiOperation({
    summary: 'Recibir webhook de Kapso',
    description: 'Valida la firma, evita duplicados y encola el mensaje para procesamiento.',
  })
  @ApiHeader({
    name: 'x-webhook-signature',
    required: true,
    description: 'Firma HMAC SHA-256 del payload enviada por Kapso.',
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description: 'Clave opcional de idempotencia enviada por Kapso.',
  })
  @ApiBody({ type: KapsoWebhookDocDto })
  @ApiOkResponse({
    description: 'Webhook aceptado y clasificado.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(KapsoWebhookIgnoredResponseDto) },
        { $ref: getSchemaPath(KapsoWebhookDuplicateResponseDto) },
        { $ref: getSchemaPath(KapsoWebhookEnqueuedResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Firma invalida o secreto no configurado.' })
  @ApiServiceUnavailableResponse({ description: 'No fue posible encolar el webhook.' })
  @Post('kapso')
  @HttpCode(200)
  async kapsoWebhook(
    @Req() req: RawBodyRequest,
    @Body() payload: KapsoWebhookDto,
    @Headers('x-webhook-signature') signatureHeader: string | undefined,
    @Headers('x-idempotency-key') idempotencyKeyHeader: string | undefined,
    @Headers('x-kapso-idempotency-key') legacyIdempotencyKeyHeader: string | undefined,
  ) {
    const secret = process.env.KAPSO_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error('Rejecting Kapso webhook because KAPSO_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException();
    }

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload ?? {}));
    if (!signatureHeader) {
      this.logger.warn('Rejecting Kapso webhook because X-Webhook-Signature header is missing');
      throw new UnauthorizedException();
    }

    const valid = isValidKapsoSignature({
      secret,
      signatureHeader,
      rawBody,
    });
    if (!valid) {
      this.logger.warn('Rejecting Kapso webhook because X-Webhook-Signature did not match raw body');
      throw new UnauthorizedException();
    }

    const result = await this.webhooks.handleKapsoWebhook(
      payload,
      idempotencyKeyHeader ?? legacyIdempotencyKeyHeader,
    );
    return { message: 'ok', ...result };
  }
}
