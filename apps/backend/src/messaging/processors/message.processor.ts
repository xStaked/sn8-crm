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
    const normalized = this.channel.normalizeInbound(payload);

    try {
      await this.prisma.message.create({
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
    } catch (err: any) {
      // Layer-2 idempotency: DB unique constraint on Message.externalMessageId.
      if (err && typeof err === 'object' && (err as any).code === 'P2002') {
        this.logger.debug({
          event: 'message_duplicate_ignored',
          externalMessageId: normalized.externalMessageId,
        });
        return;
      }

      throw err;
    }
  }
}
