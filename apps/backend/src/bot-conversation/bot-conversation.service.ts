import { Injectable } from '@nestjs/common';
import { ConversationFlowService } from '../ai-sales/conversation-flow.service';
import type { NormalizedMessage } from '../channels/channel.adapter';
import { BotConversationRepository } from './bot-conversation.repository';
import { HumanHandoffService } from './human-handoff.service';
import {
  buildGreetingMessage,
  buildHumanHandoffCustomerMessage,
  buildInfoServicesMessage,
  PHASE_2_GREETING_BUTTONS,
} from './prompts/greeting-messages';
import {
  BotConversationState,
  type BotConversationSnapshot,
  type SaveBotConversationStateInput,
} from './bot-conversation.types';

export const BOT_CONVERSATION_TTL_SECONDS = 24 * 60 * 60;

export type BotConversationOutboundPlan =
  | {
      kind: 'text';
      body: string;
      source: string;
    }
  | {
      kind: 'interactive-buttons';
      body: string;
      buttons: typeof PHASE_2_GREETING_BUTTONS;
      source: string;
    };

export type BotConversationDecision = {
  nextState: BotConversationState;
  outbound: BotConversationOutboundPlan;
};

@Injectable()
export class BotConversationService {
  constructor(
    private readonly repository: BotConversationRepository,
    private readonly conversationFlowService: ConversationFlowService,
    private readonly humanHandoffService: HumanHandoffService,
  ) {}

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

  async handleInbound(normalized: NormalizedMessage): Promise<BotConversationDecision> {
    const existingState = await this.loadState(normalized.fromPhone);
    const isExpired =
      !!existingState && existingState.expiresAt.getTime() <= Date.now();

    if (!existingState || isExpired) {
      return this.buildGreetingDecision(
        normalized,
        isExpired ? 'returning_contact' : 'first_contact',
      );
    }

    const selection = normalized.interactiveReply?.id ?? null;

    if (selection === 'INFO_SERVICES') {
      await this.transition({
        conversationId: normalized.fromPhone,
        state: BotConversationState.INFO_SERVICES,
        metadata: { topic: 'services_overview' },
        lastInboundMessageId: normalized.externalMessageId,
      });

      return {
        nextState: BotConversationState.INFO_SERVICES,
        outbound: {
          kind: 'text',
          body: buildInfoServicesMessage(),
          source: 'bot-info-services',
        },
      };
    }

    if (selection === 'HUMAN_HANDOFF') {
      await this.humanHandoffService.notifyOwner({
        conversationId: normalized.fromPhone,
        inboundMessageId: normalized.externalMessageId,
        customerMessageBody: normalized.body,
      });

      await this.transition({
        conversationId: normalized.fromPhone,
        state: BotConversationState.HUMAN_HANDOFF,
        metadata: {
          requestedAt: new Date().toISOString(),
          ownerNotified: true,
        },
        lastInboundMessageId: normalized.externalMessageId,
      });

      return {
        nextState: BotConversationState.HUMAN_HANDOFF,
        outbound: {
          kind: 'text',
          body: buildHumanHandoffCustomerMessage(),
          source: 'bot-human-handoff',
        },
      };
    }

    if (
      selection === 'QUOTE_PROJECT' ||
      existingState.state === BotConversationState.QUALIFYING ||
      existingState.state === BotConversationState.AI_SALES
    ) {
      const replyPlan = await this.conversationFlowService.planReply({
        conversationId: normalized.fromPhone,
        inboundMessageId: normalized.externalMessageId,
        inboundBody: normalized.body,
      });

      await this.transition({
        conversationId: normalized.fromPhone,
        state: BotConversationState.QUALIFYING,
        metadata: { delegatedToAiSales: true },
        lastInboundMessageId: normalized.externalMessageId,
      });

      return {
        nextState: BotConversationState.QUALIFYING,
        outbound: {
          kind: 'text',
          body: replyPlan.body,
          source: replyPlan.source,
        },
      };
    }

    if (existingState.state === BotConversationState.INFO_SERVICES) {
      await this.transition({
        conversationId: normalized.fromPhone,
        state: BotConversationState.INFO_SERVICES,
        metadata: { topic: 'services_overview' },
        lastInboundMessageId: normalized.externalMessageId,
      });

      return {
        nextState: BotConversationState.INFO_SERVICES,
        outbound: {
          kind: 'text',
          body: buildInfoServicesMessage(),
          source: 'bot-info-services',
        },
      };
    }

    if (existingState.state === BotConversationState.HUMAN_HANDOFF) {
      await this.transition({
        conversationId: normalized.fromPhone,
        state: BotConversationState.HUMAN_HANDOFF,
        metadata: existingState.metadata,
        lastInboundMessageId: normalized.externalMessageId,
      });

      return {
        nextState: BotConversationState.HUMAN_HANDOFF,
        outbound: {
          kind: 'text',
          body: buildHumanHandoffCustomerMessage(),
          source: 'bot-human-handoff',
        },
      };
    }

    return this.buildGreetingDecision(normalized, 'first_contact');
  }

  private async buildGreetingDecision(
    normalized: NormalizedMessage,
    variant: 'first_contact' | 'returning_contact',
  ): Promise<BotConversationDecision> {
    await this.transition({
      conversationId: normalized.fromPhone,
      state: BotConversationState.GREETING,
      metadata: { greetingVariant: variant },
      lastInboundMessageId: normalized.externalMessageId,
    });

    return {
      nextState: BotConversationState.GREETING,
      outbound: {
        kind: 'interactive-buttons',
        body: buildGreetingMessage(variant),
        buttons: PHASE_2_GREETING_BUTTONS,
        source: 'bot-greeting',
      },
    };
  }
}

export {
  BotConversationState,
  type BotConversationSnapshot,
  type SaveBotConversationStateInput,
} from './bot-conversation.types';
