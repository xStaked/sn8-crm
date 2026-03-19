import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ConversationDirection = 'inbound' | 'outbound';

type MessageRow = {
  id: string;
  direction: string;
  fromPhone: string;
  toPhone: string;
  body: string | null;
  createdAt: Date;
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

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private getStableConversationId(message: MessageRow): string {
    const participantPhone =
      this.normalizeDirection(message.direction) === 'outbound'
        ? message.toPhone
        : message.fromPhone;

    return this.normalizeParticipantPhone(participantPhone);
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
