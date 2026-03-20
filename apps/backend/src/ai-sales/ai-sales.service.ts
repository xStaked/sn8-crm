import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, QuoteDraft } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QUOTE_TEMPLATE } from './prompts/quote-template.contract';
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
    private readonly prisma: PrismaService,
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

  async createQuoteDraftFromTranscript(input: {
    conversationId: string;
    transcript: string;
    commercialBriefId: string;
  }): Promise<QuoteDraft> {
    const brief = await this.prisma.commercialBrief.findUniqueOrThrow({
      where: { id: input.commercialBriefId },
      include: {
        quoteDrafts: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    const result = await this.generateQuoteDraft({
      conversationId: input.conversationId,
      transcript: input.transcript,
      commercialBrief: {
        customerName: brief.customerName ?? undefined,
        projectType: brief.projectType ?? undefined,
        businessProblem: brief.businessProblem ?? undefined,
        desiredScope: brief.desiredScope ?? undefined,
        budget: brief.budget ?? undefined,
        urgency: brief.urgency ?? undefined,
        constraints: brief.constraints ?? undefined,
        summary: brief.summary ?? undefined,
      },
      quoteTemplate: {
        version: QUOTE_TEMPLATE.version,
        title: QUOTE_TEMPLATE.reviewGateLabel,
        sections: QUOTE_TEMPLATE.sections.map((section) => section.label),
        note: QUOTE_TEMPLATE.customerDisclosure,
      },
    });

    const nextVersion = (brief.quoteDrafts[0]?.version ?? 0) + 1;
    const draftPayload: Prisma.InputJsonObject = {
      summary: result.summary,
      structuredDraft: result.structuredDraft as Prisma.InputJsonValue,
      renderedQuote: result.renderedQuote,
      model: result.model,
    };

    return this.prisma.quoteDraft.create({
      data: {
        commercialBriefId: brief.id,
        conversationId: input.conversationId,
        version: nextVersion,
        origin: nextVersion === 1 ? 'initial' : 'regenerated',
        reviewStatus: 'pending_owner_review',
        templateVersion: QUOTE_TEMPLATE.version,
        draftPayload,
        renderedQuote: result.renderedQuote,
      },
    });
  }
}
