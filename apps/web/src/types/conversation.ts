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

export type Conversation = {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  pendingQuote?: PendingQuoteSummary | null;
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
  quoteDraftId: string;
  version: number;
  reviewStatus: PendingQuoteReviewStatus;
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
};

export type ConversationQuoteReviewDto = ConversationQuoteReview;

export type ConversationQuoteReviewState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unauthorized"
  | "error";
