export const AI_PROVIDER = Symbol('AI_PROVIDER');

export type CommercialBriefSnapshot = {
  customerName?: string;
  projectType?: string;
  businessProblem?: string;
  desiredScope?: string;
  budget?: string;
  urgency?: string;
  constraints?: string;
  summary?: string;
  customerSignals?: string[];
  agentInferences?: string[];
  missingInformation?: string[];
};

export type ExtractCommercialBriefInput = {
  conversationId: string;
  transcript: string;
  existingBrief?: Partial<CommercialBriefSnapshot>;
};

export type QuoteTemplateSnapshot = {
  version: string;
  title: string;
  sections: string[];
  note?: string;
};

export type GenerateQuoteDraftInput = {
  conversationId: string;
  transcript: string;
  commercialBrief: CommercialBriefSnapshot;
  quoteTemplate: QuoteTemplateSnapshot;
};

export type RegenerateQuoteDraftInput = GenerateQuoteDraftInput & {
  ownerFeedback: string;
  previousDraft: string;
};

export type QuoteDraftResult = {
  summary: string;
  structuredDraft: Record<string, unknown>;
  renderedQuote: string;
  ownerReviewNotes?: string[];
  customerSafeStatus?: string;
  model: string;
};

export interface AiProvider {
  extractCommercialBrief(
    input: ExtractCommercialBriefInput,
  ): Promise<CommercialBriefSnapshot>;

  generateQuoteDraft(input: GenerateQuoteDraftInput): Promise<QuoteDraftResult>;

  regenerateQuoteDraft(input: RegenerateQuoteDraftInput): Promise<QuoteDraftResult>;
}
