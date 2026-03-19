import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { KapsoWebhookDto } from './dto/kapso-webhook.dto';

export type KapsoWebhookHandlingResult =
  | { status: 'ignored' }
  | { status: 'duplicate'; messageId: string }
  | { status: 'enqueued'; messageId: string };

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectQueue('incoming-messages') private readonly messageQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
      });
      return { status: 'enqueued', messageId };
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
}
