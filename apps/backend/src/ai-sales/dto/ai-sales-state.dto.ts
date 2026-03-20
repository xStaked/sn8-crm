export const AI_SALES_QUEUE = 'ai-sales';
export const AI_SALES_PROCESS_QUALIFIED_JOB = 'process-qualified-conversation';

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
  triggeredBy: 'phase-2-handoff' | 'manual-retry' | 'test';
  requestedAt: string;
};
