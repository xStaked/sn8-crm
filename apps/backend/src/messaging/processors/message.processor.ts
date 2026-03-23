import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { ChannelAdapter } from '../../channels/channel.adapter';
import { BotConversationService } from '../../bot-conversation/bot-conversation.service';
import { MessagingService } from '../messaging.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('incoming-messages')
export class MessageProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channel: ChannelAdapter,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => BotConversationService))
    private readonly botConversationService: BotConversationService,
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

    if (!this.shouldAutoReply(normalized)) {
      return;
    }

    const senderPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;
    const decision = await this.botConversationService.handleInbound(normalized);
    const replyBody = decision.outbound.body;
    const externalMessageId =
      decision.outbound.kind === 'interactive-buttons'
        ? await this.messagingService.sendInteractiveButtons(
            normalized.fromPhone,
            replyBody,
            decision.outbound.buttons,
            senderPhoneNumberId,
          )
        : await this.messagingService.sendText(
            normalized.fromPhone,
            replyBody,
            senderPhoneNumberId,
          );

    await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: senderPhoneNumberId ?? 'bot',
        toPhone: normalized.fromPhone,
        body: replyBody,
        channel: normalized.channel,
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: senderPhoneNumberId ?? 'bot',
          toPhone: normalized.fromPhone,
          body: replyBody,
          source: decision.outbound.source,
          kind: decision.outbound.kind,
          state: decision.nextState,
          buttons:
            decision.outbound.kind === 'interactive-buttons'
              ? decision.outbound.buttons
              : undefined,
          replyToExternalMessageId: normalized.externalMessageId,
        },
      },
    });

    this.logger.log({
      event: 'message_auto_replied',
      jobId: job.id ?? null,
      inboundExternalMessageId: normalized.externalMessageId,
      outboundExternalMessageId: externalMessageId,
      toPhone: normalized.fromPhone,
    });
  }

  private shouldAutoReply(normalized: {
    direction: string;
    fromPhone: string;
    body: string | null;
    externalMessageId: string;
  }): boolean {
    if (normalized.direction !== 'inbound') {
      return false;
    }

    const body = normalized.body?.trim() ?? '';
    if (!body) {
      return false;
    }

    if (this.isOwnerPhone(normalized.fromPhone)) {
      return false;
    }

    if (body.toUpperCase().startsWith('SN8 ')) {
      return false;
    }

    return true;
  }

  private isOwnerPhone(fromPhone: string): boolean {
    const ownerPhone = this.config.get<string>('AI_SALES_OWNER_PHONE')?.trim();
    if (!ownerPhone) {
      return false;
    }

    return this.normalizePhone(fromPhone) === this.normalizePhone(ownerPhone);
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }
}
