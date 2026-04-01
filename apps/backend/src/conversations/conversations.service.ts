import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConversationQuoteReviewDto,
  PendingQuoteSummaryDto,
} from './dto/quote-review-response.dto';

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
  pendingQuote: PendingQuoteSummaryDto | null;
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

const reviewRelevantStatuses = [
  'pending_owner_review',
  'ready_for_recheck',
  'changes_requested',
  'approved',
  'delivered_to_customer',
] as const;

const actionableReviewStatuses = [
  'pending_owner_review',
  'ready_for_recheck',
] as const;

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
        pendingQuote: null,
      });
    }

    const conversationIds = Array.from(summaries.keys());
    const pendingQuotesByConversationId =
      await this.getActionableQuoteSummariesByConversationIds(conversationIds);

    return Array.from(summaries.values()).map((summary) => ({
      ...summary,
      pendingQuote: pendingQuotesByConversationId.get(summary.id) ?? null,
    }));
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

  async getConversationQuoteReview(
    conversationId: string,
  ): Promise<ConversationQuoteReviewDto> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    const draft = await this.findLatestReviewRelevantDraft(normalizedConversationId);

    if (!draft) {
      throw new NotFoundException(
        `Conversation ${normalizedConversationId} has no quote review draft.`,
      );
    }

    return {
      conversationId: draft.conversationId,
      quoteDraftId: draft.id,
      version: draft.version,
      reviewStatus: draft.reviewStatus,
      renderedQuote: draft.renderedQuote,
      draftSummary: this.getDraftSummary(draft.draftPayload),
      ownerFeedbackSummary: draft.ownerFeedbackSummary,
      approvedAt: draft.approvedAt?.toISOString() ?? null,
      deliveredToCustomerAt: draft.deliveredToCustomerAt?.toISOString() ?? null,
      commercialBrief: {
        customerName: draft.commercialBrief.customerName,
        summary: draft.commercialBrief.summary,
        projectType: draft.commercialBrief.projectType,
        budget: draft.commercialBrief.budget,
        urgency: draft.commercialBrief.urgency,
      },
    };
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

  private async assertConversationExists(conversationId: string): Promise<void> {
    const existingMessage = await this.prisma.message.findFirst({
      where: {
        OR: [{ fromPhone: conversationId }, { toPhone: conversationId }],
      },
      select: { id: true, direction: true, fromPhone: true, toPhone: true },
    });

    if (!existingMessage || this.getStableConversationId(existingMessage) !== conversationId) {
      throw new NotFoundException(`Conversation ${conversationId} was not found.`);
    }
  }

  private async getActionableQuoteSummariesByConversationIds(
    conversationIds: string[],
  ): Promise<Map<string, PendingQuoteSummaryDto>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const drafts = await this.prisma.quoteDraft.findMany({
      where: {
        conversationId: { in: conversationIds },
        reviewStatus: { in: [...reviewRelevantStatuses] },
      },
      orderBy: [{ conversationId: 'asc' }, { version: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        conversationId: true,
        version: true,
        reviewStatus: true,
      },
    });

    const summaries = new Map<string, PendingQuoteSummaryDto>();

    for (const draft of drafts) {
      if (summaries.has(draft.conversationId)) {
        continue;
      }

      if (!actionableReviewStatuses.includes(draft.reviewStatus)) {
        continue;
      }

      summaries.set(draft.conversationId, {
        conversationId: draft.conversationId,
        quoteDraftId: draft.id,
        version: draft.version,
        reviewStatus: draft.reviewStatus,
      });
    }

    return summaries;
  }

  private async findLatestReviewRelevantDraft(conversationId: string) {
    return this.prisma.quoteDraft.findFirst({
      where: {
        conversationId,
        reviewStatus: { in: [...reviewRelevantStatuses] },
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      include: {
        commercialBrief: {
          select: {
            customerName: true,
            summary: true,
            projectType: true,
            budget: true,
            urgency: true,
          },
        },
      },
    });
  }

  private getDraftSummary(draftPayload: unknown): string | null {
    if (!isRecord(draftPayload)) {
      return null;
    }

    const summary =
      typeof draftPayload.summary === 'string' ? draftPayload.summary.trim() : '';

    return summary || null;
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
