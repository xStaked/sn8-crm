import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';

type ConversationDirection = 'inbound' | 'outbound';

type MessageRow = {
  id: string;
  direction: string;
  fromPhone: string;
  toPhone: string;
  body: string | null;
  createdAt: Date;
  rawPayload?: unknown;
};

type ConversationSummary = {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

type ConversationMessage = {
  id: string;
  conversationId: string;
  direction: ConversationDirection;
  body: string | null;
  createdAt: string;
};

const messageProjection = {
  id: true,
  direction: true,
  fromPhone: true,
  toPhone: true,
  body: true,
  createdAt: true,
} as const;

const messageProjectionWithRawPayload = {
  ...messageProjection,
  rawPayload: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
  ) {}

  async listConversations(): Promise<ConversationSummary[]> {
    const messages = await this.prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      select: messageProjection,
    });

    const summaries = new Map<string, ConversationSummary>();

    for (const message of messages) {
      const conversationId = this.getStableConversationId(message);

      if (summaries.has(conversationId)) {
        continue;
      }

      summaries.set(conversationId, {
        id: conversationId,
        contactName: conversationId,
        lastMessage: message.body ?? '',
        lastMessageAt: message.createdAt.toISOString(),
        unreadCount: 0,
      });
    }

    return Array.from(summaries.values());
  }

  async listConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    const messages = await this.prisma.message.findMany({
      orderBy: { createdAt: 'asc' },
      select: messageProjection,
    });

    const history = messages
      .filter((message) => this.getStableConversationId(message) === normalizedConversationId)
      .map((message) => ({
        id: message.id,
        conversationId: normalizedConversationId,
        direction: this.normalizeDirection(message.direction),
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      }));

    if (history.length === 0) {
      throw new NotFoundException(
        `Conversation ${normalizedConversationId} was not found.`,
      );
    }

    return history;
  }

  async sendMessage(
    conversationId: string,
    body: string,
  ): Promise<ConversationMessage> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    const normalizedBody = body.trim();
    const { senderPhoneNumberId, source } = await this.resolveSenderPhoneNumberId(
      normalizedConversationId,
    );
    this.logger.log({
      event: 'conversation_send_message_attempt',
      conversationId: normalizedConversationId,
      senderPhoneNumberId: senderPhoneNumberId ?? null,
      senderSource: source,
      bodyPreview: normalizedBody.slice(0, 120),
    });
    const externalMessageId = await this.messagingService.sendText(
      normalizedConversationId,
      normalizedBody,
      senderPhoneNumberId,
    );
    const fromPhone =
      senderPhoneNumberId ?? this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim();

    const created = await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: fromPhone && fromPhone.length > 0 ? fromPhone : 'crm',
        toPhone: normalizedConversationId,
        body: normalizedBody,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: fromPhone && fromPhone.length > 0 ? fromPhone : 'crm',
          toPhone: normalizedConversationId,
          body: normalizedBody,
          source: 'crm-manual-reply',
        },
      },
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
      },
    });

    return {
      id: created.id,
      conversationId: normalizedConversationId,
      direction: this.normalizeDirection(created.direction),
      body: created.body,
      createdAt: created.createdAt.toISOString(),
    };
  }

  private getStableConversationId(message: MessageRow): string {
    const participantPhone =
      this.normalizeDirection(message.direction) === 'outbound'
        ? message.toPhone
        : message.fromPhone;

    return this.normalizeParticipantPhone(participantPhone);
  }

  private async resolveSenderPhoneNumberId(
    normalizedConversationId: string,
  ): Promise<{ senderPhoneNumberId?: string; source: 'history' | 'config' | 'missing' }> {
    const messages = await this.prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      select: messageProjectionWithRawPayload,
    });

    for (const message of messages) {
      if (this.getStableConversationId(message) !== normalizedConversationId) {
        continue;
      }

      const senderPhoneNumberId = this.extractSenderPhoneNumberId(message.rawPayload);
      if (senderPhoneNumberId) {
        return { senderPhoneNumberId, source: 'history' };
      }
    }

    const fallbackPhoneNumberId = this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim();
    if (fallbackPhoneNumberId) {
      return { senderPhoneNumberId: fallbackPhoneNumberId, source: 'config' };
    }

    return { source: 'missing' };
  }

  private extractSenderPhoneNumberId(rawPayload: unknown): string | undefined {
    if (!isRecord(rawPayload)) {
      return undefined;
    }

    const directPhoneNumberId =
      typeof rawPayload.phone_number_id === 'string' ? rawPayload.phone_number_id.trim() : '';
    if (directPhoneNumberId) {
      return directPhoneNumberId;
    }

    const metadata = isRecord(rawPayload.metadata) ? rawPayload.metadata : undefined;
    const metadataPhoneNumberId =
      metadata && typeof metadata.phone_number_id === 'string'
        ? metadata.phone_number_id.trim()
        : '';
    if (metadataPhoneNumberId) {
      return metadataPhoneNumberId;
    }

    if (Array.isArray(rawPayload.entry)) {
      for (const entry of rawPayload.entry) {
        if (!isRecord(entry) || !Array.isArray(entry.changes)) {
          continue;
        }

        for (const change of entry.changes) {
          const value = isRecord(change) && isRecord(change.value) ? change.value : undefined;
          const nestedMetadata =
            value && isRecord(value.metadata) ? value.metadata : undefined;
          const nestedPhoneNumberId =
            nestedMetadata && typeof nestedMetadata.phone_number_id === 'string'
              ? nestedMetadata.phone_number_id.trim()
              : '';

          if (nestedPhoneNumberId) {
            return nestedPhoneNumberId;
          }
        }
      }
    }

    if (Array.isArray(rawPayload.data)) {
      for (const item of rawPayload.data) {
        if (!isRecord(item)) {
          continue;
        }

        const itemPhoneNumberId =
          typeof item.phone_number_id === 'string' ? item.phone_number_id.trim() : '';
        if (itemPhoneNumberId) {
          return itemPhoneNumberId;
        }

        const itemConversation = isRecord(item.conversation) ? item.conversation : undefined;
        const itemConversationPhoneNumberId =
          itemConversation && typeof itemConversation.phone_number_id === 'string'
            ? itemConversation.phone_number_id.trim()
            : '';
        if (itemConversationPhoneNumberId) {
          return itemConversationPhoneNumberId;
        }
      }
    }

    const conversation = isRecord(rawPayload.conversation) ? rawPayload.conversation : undefined;
    const conversationPhoneNumberId =
      conversation && typeof conversation.phone_number_id === 'string'
        ? conversation.phone_number_id.trim()
        : '';
    if (conversationPhoneNumberId) {
      return conversationPhoneNumberId;
    }

    return undefined;
  }

  private normalizeDirection(direction: string): ConversationDirection {
    if (direction === 'inbound' || direction === 'outbound') {
      return direction;
    }

    throw new Error(`Unsupported conversation direction: ${direction}`);
  }

  private normalizeParticipantPhone(phone: string): string {
    return phone.trim();
  }
}
