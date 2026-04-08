export type PendingQuoteReviewStatus =
  | "pending_owner_review"
  | "ready_for_recheck"
  | "changes_requested"
  | "approved"
  | "delivered_to_customer";

export type PendingQuoteSummary = {
  conversationId: string;
  quoteDraftId: string;
  version: number;
  reviewStatus: PendingQuoteReviewStatus;
  updatedAt?: string | null;
};

export type ConversationControlMode =
  | "ai_control"
  | "human_control"
  | "pending_resume";

export type ConversationControlState =
  | "GREETING"
  | "INFO_SERVICES"
  | "QUALIFYING"
  | "HUMAN_HANDOFF"
  | "AI_SALES";

export type ConversationControlSummary = {
  state: ConversationControlState;
  control: ConversationControlMode;
  updatedAt: string;
  updatedBy: string;
};

export type Conversation = {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  pendingQuote?: PendingQuoteSummary | null;
  conversationControl: ConversationControlSummary;
};

export type ConversationSummaryDto = Conversation;

export type ConversationListState =
  | "loading"
  | "ready"
  | "empty"
  | "unauthorized"
  | "error";

export type ConversationMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  createdAt: string;
};

export type ConversationMessageDto = ConversationMessage;

export type ConversationMessageState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unauthorized"
  | "error";

export type ConversationQuoteReview = {
  conversationId: string;
  quoteDraftId: string | null;
  version: number | null;
  reviewStatus: PendingQuoteReviewStatus | null;
  lifecycleState:
    | "idle"
    | "brief_collecting"
    | "brief_complete"
    | "quote_draft_ready"
    | "quote_sent"
    | "quote_archived";
  recovery: {
    action: "create_draft" | "restart_brief" | "wait_for_review";
    message: string;
  } | null;
  renderedQuote: string | null;
  draftSummary: string | null;
  ownerFeedbackSummary: string | null;
  approvedAt: string | null;
  deliveredToCustomerAt: string | null;
  commercialBrief: {
    customerName: string | null;
    summary: string | null;
    projectType: string | null;
    budget: string | null;
    urgency: string | null;
  };
  pdf: {
    available: boolean;
    fileName: string | null;
    generatedAt: string | null;
    sizeBytes: number | null;
    version: number;
  };
  pricingRule?: {
    id: string | null;
    version: number | null;
    category: string | null;
    complexity: string | null;
    integrationType: string | null;
  };
  complexityScore: number | null;
  confidence: number | null;
  ruleVersionUsed: number | null;
  estimatedMinAmount: number | null;
  estimatedTargetAmount: number | null;
  estimatedMaxAmount: number | null;
  pricingBreakdown: Record<string, unknown> | null;
  ownerAdjustments: Array<{
    adjustedAt: string;
    adjustedBy: string;
    previousRange: { min: number; target: number; max: number };
    adjustedRange: { min: number; target: number; max: number };
    assumptions: string[];
    reason: string | null;
  }>;
};

export type ConversationQuoteReviewDto = ConversationQuoteReview;

export type ConversationQuoteReviewState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unauthorized"
  | "error";
