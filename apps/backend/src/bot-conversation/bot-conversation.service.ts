import { Injectable } from '@nestjs/common';
import { ConversationFlowService } from '../ai-sales/conversation-flow.service';
import type { NormalizedMessage } from '../channels/channel.adapter';
import { BotConversationRepository } from './bot-conversation.repository';
import { HumanHandoffService } from './human-handoff.service';
import {
  buildGreetingMessage,
  buildHumanHandoffCustomerMessage,
  PHASE_2_GREETING_BUTTONS,
} from './prompts/greeting-messages';
import {
  BotConversationState,
  type BotConversationSnapshot,
  type SaveBotConversationStateInput,
} from './bot-conversation.types';
import {
  IntentClassifierService,
  type GreetingIntent,
} from './intent-classifier.service';
import { buildInfoServicesMessage } from './prompts/info-services.prompt';
import {
  buildOffFlowMessage,
  OFF_FLOW_MAX_RETRIES,
} from './prompts/off-flow.prompt';

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

type ResolvedConversationState = {
  snapshot: BotConversationSnapshot | null;
  expired: boolean;
};

@Injectable()
export class BotConversationService {
  constructor(
    private readonly repository: BotConversationRepository,
    private readonly conversationFlowService: ConversationFlowService,
    private readonly humanHandoffService: HumanHandoffService,
    private readonly intentClassifierService: IntentClassifierService,
  ) {}

  async loadState(conversationId: string): Promise<BotConversationSnapshot | null> {
    const resolvedState = await this.resolveState(conversationId);
    return resolvedState.expired ? null : resolvedState.snapshot;
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
    const resolvedState = await this.resolveState(normalized.fromPhone);
    const existingState = resolvedState.snapshot;
    const isExpired = resolvedState.expired;

    if (!existingState || isExpired) {
      if (this.isNonTextMessage(normalized)) {
        return this.handleInitialMediaFallback(
          normalized,
          isExpired ? 'returning_contact' : 'first_contact',
        );
      }

      return this.buildGreetingDecision(
        normalized,
        isExpired ? 'returning_contact' : 'first_contact',
      );
    }

    const selection = normalized.interactiveReply?.id ?? null;

    if (this.isNonTextMessage(normalized)) {
      return this.handleOffFlowAttempt(existingState, normalized, true);
    }

    if (!selection && existingState.state === BotConversationState.GREETING) {
      const greetingIntent =
        await this.intentClassifierService.classifyGreetingIntent(normalized.body);

      return this.routeGreetingIntent(normalized, greetingIntent);
    }

    if (selection === 'INFO_SERVICES') {
      await this.transition({
        conversationId: normalized.fromPhone,
        state: BotConversationState.INFO_SERVICES,
        metadata: { topic: 'services_overview' },
        offFlowCount: 0,
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
        offFlowCount: 0,
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
        offFlowCount: 0,
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

    if (!selection && existingState.state === BotConversationState.INFO_SERVICES) {
      if (this.isReadyToQualify(normalized.body)) {
        return this.delegateToQualifying(normalized);
      }

      if (this.isServicesInformationRequest(normalized.body)) {
        await this.transition({
          conversationId: normalized.fromPhone,
          state: BotConversationState.INFO_SERVICES,
          metadata: { topic: 'services_overview' },
          offFlowCount: 0,
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

      const greetingIntent =
        await this.intentClassifierService.classifyGreetingIntent(normalized.body);
      if (greetingIntent === 'human_handoff') {
        return this.routeGreetingIntent(normalized, greetingIntent);
      }

      return this.handleOffFlowAttempt(existingState, normalized);
    }

    if (existingState.state === BotConversationState.HUMAN_HANDOFF) {
      await this.transition({
        conversationId: normalized.fromPhone,
        state: BotConversationState.HUMAN_HANDOFF,
        metadata: existingState.metadata,
        offFlowCount: 0,
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

    return this.handleOffFlowAttempt(existingState, normalized);
  }

  private async buildGreetingDecision(
    normalized: NormalizedMessage,
    variant: 'first_contact' | 'returning_contact',
  ): Promise<BotConversationDecision> {
    await this.transition({
      conversationId: normalized.fromPhone,
      state: BotConversationState.GREETING,
      metadata: { greetingVariant: variant },
      offFlowCount: 0,
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

  private async handleInitialMediaFallback(
    normalized: NormalizedMessage,
    variant: 'first_contact' | 'returning_contact',
  ): Promise<BotConversationDecision> {
    await this.transition({
      conversationId: normalized.fromPhone,
      state: BotConversationState.GREETING,
      metadata: { greetingVariant: variant },
      offFlowCount: 1,
      lastInboundMessageId: normalized.externalMessageId,
    });

    return {
      nextState: BotConversationState.GREETING,
      outbound: {
        kind: 'text',
        body: buildOffFlowMessage({
          state: BotConversationState.GREETING,
          attempt: 1,
          isMedia: true,
        }),
        source: 'bot-media-fallback',
      },
    };
  }

  private async routeGreetingIntent(
    normalized: NormalizedMessage,
    intent: GreetingIntent,
  ): Promise<BotConversationDecision> {
    switch (intent) {
      case 'learn_services':
        await this.transition({
          conversationId: normalized.fromPhone,
          state: BotConversationState.INFO_SERVICES,
          metadata: { topic: 'services_overview' },
          offFlowCount: 0,
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
      case 'human_handoff':
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
          offFlowCount: 0,
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
      case 'quote_project':
      default:
        return this.delegateToQualifying(normalized);
    }
  }

  private async delegateToQualifying(
    normalized: NormalizedMessage,
  ): Promise<BotConversationDecision> {
    const replyPlan = await this.conversationFlowService.planReply({
      conversationId: normalized.fromPhone,
      inboundMessageId: normalized.externalMessageId,
      inboundBody: normalized.body,
    });

    await this.transition({
      conversationId: normalized.fromPhone,
      state: BotConversationState.QUALIFYING,
      metadata: { delegatedToAiSales: true },
      offFlowCount: 0,
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

  private async handleOffFlowAttempt(
    existingState: BotConversationSnapshot,
    normalized: NormalizedMessage,
    isMedia = false,
  ): Promise<BotConversationDecision> {
    const nextOffFlowCount = existingState.offFlowCount + 1;

    if (nextOffFlowCount >= OFF_FLOW_MAX_RETRIES) {
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
          escalatedFrom: existingState.state,
        },
        offFlowCount: nextOffFlowCount,
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

    await this.transition({
      conversationId: normalized.fromPhone,
      state: existingState.state,
      metadata: existingState.metadata,
      offFlowCount: nextOffFlowCount,
      lastInboundMessageId: normalized.externalMessageId,
    });

    return {
      nextState: existingState.state,
      outbound: {
        kind: 'text',
        body: buildOffFlowMessage({
          state: existingState.state,
          attempt: nextOffFlowCount,
          lastUserMessage: normalized.body,
          isMedia,
        }),
        source: isMedia ? 'bot-media-fallback' : 'bot-off-flow',
      },
    };
  }

  private isNonTextMessage(normalized: NormalizedMessage): boolean {
    return normalized.messageType !== 'text' && normalized.messageType !== 'interactive';
  }

  private isReadyToQualify(message: string | null): boolean {
    const normalized = this.normalize(message);
    return ['cotizar', 'cotizacion', 'cotización', 'proyecto', 'presupuesto', 'avancemos']
      .map((token) => token.normalize('NFD').replace(/\p{Diacritic}/gu, ''))
      .some((token) => normalized.includes(token));
  }

  private isServicesInformationRequest(message: string | null): boolean {
    const normalized = this.normalize(message);
    return ['servicio', 'servicios', 'automatizacion', 'automatizaciones', 'ia', 'software']
      .some((token) => normalized.includes(token));
  }

  private normalize(message: string | null): string {
    return (
      message
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim() ?? ''
    );
  }

  private async resolveState(
    conversationId: string,
  ): Promise<ResolvedConversationState> {
    const cachedState = await this.repository.loadState(conversationId);
    if (cachedState) {
      return {
        snapshot: cachedState,
        expired: cachedState.expiresAt.getTime() <= Date.now(),
      };
    }

    const rebuiltState = await this.repository.rebuildState(conversationId);
    if (!rebuiltState) {
      return {
        snapshot: null,
        expired: false,
      };
    }

    return {
      snapshot: rebuiltState,
      expired: rebuiltState.expiresAt.getTime() <= Date.now(),
    };
  }
}

export {
  BotConversationState,
  type BotConversationSnapshot,
  type SaveBotConversationStateInput,
} from './bot-conversation.types';
