export const AI_SALES_QUEUE = 'ai-sales';
export const AI_SALES_PROCESS_QUALIFIED_JOB = 'process-qualified-conversation';
export const AI_SALES_PROCESS_OWNER_REVISION_JOB = 'process-owner-revision';

export type AiSalesProcessingStage = 'needs_discovery' | 'draft_ready_for_review';

export type AiSalesStateDto = {
  conversationId: string;
  briefId: string;
  briefStatus: string;
  quoteDraftId?: string;
  quoteDraftVersion?: number;
  quoteReviewStatus?: string;
  processingStage: AiSalesProcessingStage;
  missingFields: string[];
};

export type ProcessQualifiedConversationJob = {
  conversationId: string;
  triggeredBy: 'phase-2-handoff' | 'manual-retry' | 'test' | 'customer-message';
  requestedAt: string;
};

export type ProcessOwnerRevisionJob = {
  conversationId: string;
  quoteDraftId: string;
  reviewEventId: string;
  requestedAt: string;
};
