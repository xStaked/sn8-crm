import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ChannelAdapter } from '../../channels/channel.adapter';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('incoming-messages')
export class MessageProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channel: ChannelAdapter,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const payload = job.data?.payload ?? job.data;
    this.logger.log({
      event: 'message_job_received',
      jobId: job.id ?? null,
      queueMessageId: job.data?.messageId ?? null,
      payloadKeys:
        payload && typeof payload === 'object' ? Object.keys(payload as Record<string, unknown>) : [],
    });

    let normalized;
    try {
      normalized = this.channel.normalizeInbound(payload);
      this.logger.log({
        event: 'message_normalized',
        jobId: job.id ?? null,
        externalMessageId: normalized.externalMessageId,
        fromPhone: normalized.fromPhone,
        toPhone: normalized.toPhone,
        bodyPreview: normalized.body?.slice(0, 120) ?? null,
      });
    } catch (err) {
      this.logger.error({
        event: 'message_normalization_failed',
        jobId: job.id ?? null,
        queueMessageId: job.data?.messageId ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    try {
      const created = await this.prisma.message.create({
        data: {
          externalMessageId: normalized.externalMessageId,
          direction: normalized.direction,
          fromPhone: normalized.fromPhone,
          toPhone: normalized.toPhone,
          body: normalized.body,
          channel: normalized.channel,
          rawPayload: (normalized.rawPayload ?? payload) as any,
        },
      });
      this.logger.log({
        event: 'message_persisted',
        jobId: job.id ?? null,
        id: created.id,
        externalMessageId: created.externalMessageId,
        createdAt: created.createdAt,
      });
    } catch (err: any) {
      // Layer-2 idempotency: DB unique constraint on Message.externalMessageId.
      if (err && typeof err === 'object' && (err as any).code === 'P2002') {
        this.logger.warn({
          event: 'message_duplicate_ignored',
          externalMessageId: normalized.externalMessageId,
        });
        return;
      }

      this.logger.error({
        event: 'message_persist_failed',
        jobId: job.id ?? null,
        externalMessageId: normalized.externalMessageId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
