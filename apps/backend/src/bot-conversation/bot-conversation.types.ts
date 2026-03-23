export const BOT_CONVERSATION_KEY_PREFIX = 'bot:fsm:';

export enum BotConversationState {
  GREETING = 'GREETING',
  INFO_SERVICES = 'INFO_SERVICES',
  QUALIFYING = 'QUALIFYING',
  HUMAN_HANDOFF = 'HUMAN_HANDOFF',
  AI_SALES = 'AI_SALES',
}

export type GreetingStateMetadata = {
  greetingVariant?: 'first_contact' | 'returning_contact';
};

export type InfoServicesStateMetadata = {
  topic?: string | null;
};

export type QualifyingStateMetadata = {
  delegatedToAiSales?: boolean;
};

export type HumanHandoffStateMetadata = {
  requestedAt?: string;
  ownerNotified?: boolean;
};

export type AiSalesStateMetadata = {
  briefStatus?: 'collecting' | 'ready_for_quote' | 'quote_in_review' | 'approved';
};

export type BotConversationMetadata =
  | GreetingStateMetadata
  | InfoServicesStateMetadata
  | QualifyingStateMetadata
  | HumanHandoffStateMetadata
  | AiSalesStateMetadata
  | Record<string, unknown>;

export type BotConversationSnapshot = {
  conversationId: string;
  state: BotConversationState;
  metadata: BotConversationMetadata | null;
  offFlowCount: number;
  lastInboundMessageId: string | null;
  lastTransitionAt: Date;
  expiresAt: Date;
};

export type SaveBotConversationStateInput = {
  conversationId: string;
  state: BotConversationState;
  metadata?: BotConversationMetadata | null;
  offFlowCount?: number;
  lastInboundMessageId?: string | null;
  lastTransitionAt?: Date;
};
