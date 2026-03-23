import { Injectable } from '@nestjs/common';
import { BotConversationRepository } from './bot-conversation.repository';
import {
  BotConversationState,
  type BotConversationSnapshot,
  type SaveBotConversationStateInput,
} from './bot-conversation.types';

export const BOT_CONVERSATION_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class BotConversationService {
  constructor(private readonly repository: BotConversationRepository) {}

  async loadState(conversationId: string): Promise<BotConversationSnapshot | null> {
    const cachedState = await this.repository.loadState(conversationId);
    if (cachedState) {
      return cachedState;
    }

    return this.repository.rebuildState(conversationId);
  }

  async transition(
    input: SaveBotConversationStateInput,
  ): Promise<BotConversationSnapshot> {
    return this.repository.saveState(input, BOT_CONVERSATION_TTL_SECONDS);
  }

  async ensureConversation(
    conversationId: string,
    lastInboundMessageId?: string | null,
  ): Promise<BotConversationSnapshot> {
    const existing = await this.loadState(conversationId);
    if (existing) {
      return existing;
    }

    return this.transition({
      conversationId,
      state: BotConversationState.GREETING,
      lastInboundMessageId,
      metadata: { greetingVariant: 'first_contact' },
    });
  }
}

export {
  BotConversationState,
  type BotConversationSnapshot,
  type SaveBotConversationStateInput,
} from './bot-conversation.types';
