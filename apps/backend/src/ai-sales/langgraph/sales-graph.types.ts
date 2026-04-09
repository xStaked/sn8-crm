export type SalesChannel = 'whatsapp' | 'webchat';

export type SalesGraphIntent =
  | 'new_project'
  | 'clarification'
  | 'quote_status'
  | 'discovery'
  | 'post_delivery'
  | 'human_handoff'
  | 'unknown';

export type SalesGraphQuoteReviewStatus =
  | 'pending_owner_review'
  | 'changes_requested'
  | 'approved'
  | 'delivered_to_customer';

export type SalesGraphBriefStatus =
  | 'collecting'
  | 'ready_for_quote'
  | 'quote_in_review';

export type SalesGraphState = {
  conversationId: string;
  inboundMessageId: string;
  inboundBody: string | null;
  channel: SalesChannel;
  intent: SalesGraphIntent;
  transcript: string;
  briefId?: string;
  briefStatus?: SalesGraphBriefStatus;
  missingFields: string[];
  quoteDraftId?: string;
  quoteDraftVersion?: number;
  quoteReviewStatus?: SalesGraphQuoteReviewStatus;
  escalationReason?: string;
  shouldNotifyHuman: boolean;
  responseBody?: string;
  retries: Record<string, number>;
  lastError?: string;
  traceId: string;
  startedAt: string;
};

export type SalesGraphStartInput = {
  conversationId: string;
  inboundMessageId: string;
  inboundBody: string | null;
  channel: SalesChannel;
  traceId: string;
  startedAt: string;
};
