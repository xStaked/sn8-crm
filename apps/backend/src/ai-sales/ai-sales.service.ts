import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, QuoteDraft } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QUOTE_TEMPLATE } from './prompts/quote-template.contract';
import {
  AI_PROVIDER,
  AiProvider,
  CommercialBriefSnapshot,
  GenerateDiscoveryReplyInput,
  GenerateQuoteDraftInput,
  QuoteDraftResult,
} from './ai-provider.interface';
import {
  DeterministicQuoteEstimate,
  QuoteEstimatorService,
} from './quote-estimator.service';

type PricingRuleSnapshot = {
  id: string;
  version: number;
  currency: string;
  minMarginPct: number;
  targetMarginPct: number;
  maxMarginPct: number;
  scoreWeights: Record<string, number> | null;
  confidenceWeights: Record<string, number> | null;
  category: string;
  complexity: string;
  integrationType: string;
};

@Injectable()
export class AiSalesService {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly prisma: PrismaService,
    private readonly quoteEstimatorService: QuoteEstimatorService,
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

  generateDiscoveryReply(input: GenerateDiscoveryReplyInput): Promise<string> {
    return this.provider.generateDiscoveryReply(input);
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
    const appliedPricingRule = await this.resolveApplicablePricingRule(
      brief.projectType,
    );
    const estimate = this.buildDeterministicEstimate({
      conversationId: input.conversationId,
      transcript: input.transcript,
      commercialBrief: {
        projectType: brief.projectType,
        businessProblem: brief.businessProblem,
        desiredScope: brief.desiredScope,
        budget: brief.budget,
        urgency: brief.urgency,
        constraints: brief.constraints,
        summary: brief.summary,
      },
      pricingRule: appliedPricingRule,
    });

    const draftPayload: Prisma.InputJsonObject = {
      summary: result.summary,
      structuredDraft: result.structuredDraft as Prisma.InputJsonValue,
      renderedQuote: result.renderedQuote,
      ownerReviewNotes: (result.ownerReviewNotes ?? []) as Prisma.InputJsonValue,
      customerSafeStatus: result.customerSafeStatus ?? QUOTE_TEMPLATE.customerDisclosure,
      model: result.model,
      deterministicEstimate: estimate as Prisma.InputJsonValue,
      pricingRuleApplied: appliedPricingRule
        ? {
            id: appliedPricingRule.id,
            category: appliedPricingRule.category,
            complexity: appliedPricingRule.complexity,
            integrationType: appliedPricingRule.integrationType,
            version: appliedPricingRule.version,
          }
        : null,
    };

    return this.prisma.$transaction(async (tx) => {
      const createdDraft = await tx.quoteDraft.create({
        data: {
          commercialBriefId: brief.id,
          conversationId: input.conversationId,
          version: nextVersion,
          origin: nextVersion === 1 ? 'initial' : 'regenerated',
          reviewStatus: 'pending_owner_review',
          templateVersion: QUOTE_TEMPLATE.version,
          pricingRuleId: appliedPricingRule?.id ?? null,
          pricingRuleVersion: appliedPricingRule?.version ?? null,
          draftPayload,
          renderedQuote: result.renderedQuote,
        },
      });

      await this.createEstimateSnapshot(tx, {
        conversationId: input.conversationId,
        quoteDraftId: createdDraft.id,
        pricingRuleId: appliedPricingRule?.id ?? null,
        estimate,
      });

      return createdDraft;
    });
  }

  buildDeterministicEstimate(input: {
    conversationId: string;
    transcript: string;
    commercialBrief: {
      projectType?: string | null;
      businessProblem?: string | null;
      desiredScope?: string | null;
      budget?: string | null;
      urgency?: string | null;
      constraints?: string | null;
      summary?: string | null;
    };
    pricingRule?: PricingRuleSnapshot | null;
  }): DeterministicQuoteEstimate {
    return this.quoteEstimatorService.estimate({
      conversationId: input.conversationId,
      transcript: input.transcript,
      brief: input.commercialBrief,
      pricingRule: input.pricingRule ?? null,
    });
  }

  async createEstimateSnapshot(
    tx: Prisma.TransactionClient,
    input: {
      conversationId: string;
      quoteDraftId: string | null;
      pricingRuleId: string | null;
      estimate: DeterministicQuoteEstimate;
    },
  ) {
    return tx.quoteEstimateSnapshot.create({
      data: {
        conversationId: input.conversationId,
        quoteDraftId: input.quoteDraftId,
        pricingRuleId: input.pricingRuleId,
        currency: input.estimate.currency,
        complexityScore: input.estimate.score,
        confidencePct: Math.round(input.estimate.confidence),
        estimatedMinAmount: input.estimate.min,
        estimatedTargetAmount: input.estimate.target,
        estimatedMaxAmount: input.estimate.max,
        breakdown: input.estimate.breakdown as Prisma.InputJsonValue,
        inputPayload: {
          source: 'deterministic_quote_estimator',
          assumptions: input.estimate.assumptions,
          ruleVersionUsed: input.estimate.ruleVersionUsed,
          computedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  async resolveApplicablePricingRule(projectType: string | null) {
    const requestedCategory = this.normalizePricingToken(projectType);
    if (requestedCategory) {
      const byCategory = await this.prisma.pricingRule.findFirst({
        where: {
          category: requestedCategory,
          isActive: true,
          archivedAt: null,
        },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      });

      if (byCategory) {
        return this.mapPricingRule(byCategory);
      }
    }

    const fallback = await this.prisma.pricingRule.findFirst({
      where: {
        category: 'general',
        isActive: true,
        archivedAt: null,
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    return fallback ? this.mapPricingRule(fallback) : null;
  }

  private normalizePricingToken(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private mapPricingRule(row: {
    id: string;
    version: number;
    currency: string;
    minMarginPct: Prisma.Decimal;
    targetMarginPct: Prisma.Decimal;
    maxMarginPct: Prisma.Decimal;
    scoreWeights: Prisma.JsonValue | null;
    confidenceWeights: Prisma.JsonValue | null;
    category: string;
    complexity: string;
    integrationType: string;
  }): PricingRuleSnapshot {
    return {
      id: row.id,
      version: row.version,
      currency: row.currency,
      minMarginPct: Number(row.minMarginPct),
      targetMarginPct: Number(row.targetMarginPct),
      maxMarginPct: Number(row.maxMarginPct),
      scoreWeights: this.toNumericRecordOrNull(row.scoreWeights),
      confidenceWeights: this.toNumericRecordOrNull(row.confidenceWeights),
      category: row.category,
      complexity: row.complexity,
      integrationType: row.integrationType,
    };
  }

  private toNumericRecordOrNull(value: Prisma.JsonValue | null): Record<string, number> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const entries = Object.entries(value).filter(
      ([, entryValue]) => typeof entryValue === 'number' && Number.isFinite(entryValue),
    ) as Array<[string, number]>;

    if (entries.length === 0) {
      return null;
    }

    return Object.fromEntries(entries);
  }
}
