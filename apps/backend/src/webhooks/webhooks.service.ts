import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { OwnerReviewService } from '../ai-sales/owner-review.service';
import { MessageProcessor } from '../messaging/processors/message.processor';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { KapsoWebhookDto } from './dto/kapso-webhook.dto';

export type KapsoWebhookHandlingResult =
  | { status: 'ignored' }
  | { status: 'duplicate'; messageId: string }
  | { status: 'owner-review-command'; messageId: string }
  | { status: 'enqueued'; messageId: string };

type TextCarrier = {
  text?: {
    body?: string;
  };
  from?: string;
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectQueue('incoming-messages') private readonly messageQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly ownerReviewService: OwnerReviewService,
    private readonly messageProcessor: MessageProcessor,
  ) {}

  async handleKapsoWebhook(
    payload: KapsoWebhookDto,
    headerIdempotencyKey?: string,
  ): Promise<KapsoWebhookHandlingResult> {
    const messageId =
      (headerIdempotencyKey && headerIdempotencyKey.trim()) ||
      this.extractMessageId(payload);

    this.logger.log({
      event: 'webhook_processing_started',
      headerIdempotencyKey: headerIdempotencyKey ?? null,
      messageId: messageId ?? null,
    });

    if (!messageId) {
      this.logger.warn({ event: 'webhook_missing_idempotency_key' });
      return { status: 'ignored' };
    }

    const redisKey = `wh:msg:${messageId}`;
    const reserved = await this.redis.set(redisKey, '1', 'EX', 86400, 'NX');
    if (!reserved) {
      this.logger.log({
        event: 'webhook_duplicate_skipped',
        messageId,
        redisKey,
      });
      return { status: 'duplicate', messageId };
    }

    try {
      const ownerCommandHandled = await this.tryHandleOwnerReviewCommand(payload, messageId);
      this.logger.log({
        event: 'webhook_enqueue_attempt',
        messageId,
        redisKey,
      });
      await this.messageQueue.add('process-message', { messageId, payload });
      this.logger.log({
        event: 'webhook_enqueue_success',
        messageId,
        redisKey,
        ownerCommandHandled,
      });

      await this.messageProcessor.process({
        data: { messageId, payload },
      } as any);

      this.logger.log({
        event: 'webhook_inline_processing_success',
        messageId,
        redisKey,
      });

      return {
        status: ownerCommandHandled ? 'owner-review-command' : 'enqueued',
        messageId,
      };
    } catch (err) {
      await this.redis.del(redisKey);
      this.logger.error({
        event: 'webhook_enqueue_failed',
        messageId,
        redisKey,
        // keep it JSON-serializable for structured logging
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ServiceUnavailableException('Failed to enqueue webhook payload');
    }
  }

  private extractMessageId(payload: KapsoWebhookDto): string | undefined {
    if (typeof payload?.message?.id === 'string' && payload.message.id.trim()) {
      return payload.message.id;
    }

    const nestedMessageId = payload?.entry
      ?.flatMap((entry) => entry?.changes ?? [])
      .flatMap((change) => change?.value?.messages ?? [])
      .find((message) => typeof message?.id === 'string' && message.id.trim())?.id;

    return nestedMessageId;
  }

  private async tryHandleOwnerReviewCommand(
    payload: KapsoWebhookDto,
    messageId: string,
  ): Promise<boolean> {
    const body = this.extractMessageBody(payload);
    const fromPhone = this.extractFromPhone(payload);

    if (!body || !fromPhone) {
      return false;
    }

    return this.ownerReviewService.handleOwnerCommand({
      body,
      fromPhone,
      messageId,
    });
  }

  private extractMessageBody(payload: KapsoWebhookDto): string | undefined {
    const directMessage = payload?.message as TextCarrier | undefined;
    if (
      typeof directMessage?.text?.body === 'string' &&
      directMessage.text.body.trim()
    ) {
      return directMessage.text.body;
    }

    const nestedBody = payload?.entry
      ?.flatMap((entry) => entry?.changes ?? [])
      .flatMap((change) => (change?.value?.messages ?? []) as TextCarrier[])
      .find(
        (message) =>
          typeof message?.text?.body === 'string' && message.text.body.trim(),
      )?.text?.body;

    return nestedBody;
  }

  private extractFromPhone(payload: KapsoWebhookDto): string | undefined {
    const directMessage = payload?.message as TextCarrier | undefined;
    if (typeof directMessage?.from === 'string' && directMessage.from.trim()) {
      return directMessage.from;
    }

    const nestedFrom = payload?.entry
      ?.flatMap((entry) => entry?.changes ?? [])
      .flatMap((change) => (change?.value?.messages ?? []) as TextCarrier[])
      .find((message) => typeof message?.from === 'string' && message.from.trim())
      ?.from;

    return nestedFrom;
  }
}
