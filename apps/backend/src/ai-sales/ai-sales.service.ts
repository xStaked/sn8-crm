import { Inject, Injectable } from '@nestjs/common';
import {
  AI_PROVIDER,
  AiProvider,
  CommercialBriefSnapshot,
  GenerateQuoteDraftInput,
  QuoteDraftResult,
} from './ai-provider.interface';

@Injectable()
export class AiSalesService {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  extractCommercialBrief(
    conversationId: string,
    transcript: string,
    existingBrief?: Partial<CommercialBriefSnapshot>,
  ) {
    return this.provider.extractCommercialBrief({
      conversationId,
      transcript,
      existingBrief,
    });
  }

  generateQuoteDraft(input: GenerateQuoteDraftInput): Promise<QuoteDraftResult> {
    return this.provider.generateQuoteDraft(input);
  }

  regenerateQuoteDraft(
    input: GenerateQuoteDraftInput & {
      ownerFeedback: string;
      previousDraft: string;
    },
  ): Promise<QuoteDraftResult> {
    return this.provider.regenerateQuoteDraft(input);
  }
}
