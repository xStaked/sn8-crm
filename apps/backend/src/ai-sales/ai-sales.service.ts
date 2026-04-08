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

type PricingMatrixContext = {
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
    const pricingContext = this.inferPricingMatrixContext({
      projectType: brief.projectType,
      businessProblem: brief.businessProblem,
      desiredScope: brief.desiredScope,
      constraints: brief.constraints,
      summary: brief.summary,
      transcript: input.transcript,
    });
    const appliedPricingRule = await this.resolveApplicablePricingRule(pricingContext);
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
      pricingRuleContext: pricingContext,
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

  async resolveApplicablePricingRule(context: PricingMatrixContext) {
    const candidates = this.buildPricingMatrixCandidates(context);

    for (const candidate of candidates) {
      const rule = await this.prisma.pricingRule.findFirst({
        where: {
          category: candidate.category,
          complexity: candidate.complexity,
          integrationType: candidate.integrationType,
          isActive: true,
          archivedAt: null,
        },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      });

      if (rule) {
        return this.mapPricingRule(rule);
      }
    }

    return null;
  }

  private inferPricingMatrixContext(input: {
    projectType: string | null;
    businessProblem: string | null;
    desiredScope: string | null;
    constraints: string | null;
    summary: string | null;
    transcript: string;
  }): PricingMatrixContext {
    const normalizedProjectType = this.normalizePricingToken(input.projectType);
    const text = [
      input.projectType,
      input.businessProblem,
      input.desiredScope,
      input.constraints,
      input.summary,
      input.transcript,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return {
      category: this.resolveCategory(normalizedProjectType, text),
      complexity: this.resolveComplexity(text),
      integrationType: this.resolveIntegrationType(text),
    };
  }

  private buildPricingMatrixCandidates(context: PricingMatrixContext): PricingMatrixContext[] {
    const complexityOrder = this.resolveComplexityFallbackOrder(context.complexity);
    const integrationOrder = this.resolveIntegrationFallbackOrder(context.integrationType);
    const candidates: PricingMatrixContext[] = [];

    for (const complexity of complexityOrder) {
      for (const integrationType of integrationOrder) {
        const candidate = {
          category: context.category,
          complexity,
          integrationType,
        };
        if (
          !candidates.some(
            (existing) =>
              existing.category === candidate.category &&
              existing.complexity === candidate.complexity &&
              existing.integrationType === candidate.integrationType,
          )
        ) {
          candidates.push(candidate);
        }
      }
    }

    return candidates;
  }

  private resolveComplexityFallbackOrder(
    complexity: PricingMatrixContext['complexity'],
  ): Array<PricingMatrixContext['complexity']> {
    if (complexity === 'high') {
      return ['high', 'medium', 'low'];
    }
    if (complexity === 'medium') {
      return ['medium', 'low'];
    }
    return ['low'];
  }

  private resolveIntegrationFallbackOrder(
    integrationType: PricingMatrixContext['integrationType'],
  ): Array<PricingMatrixContext['integrationType']> {
    if (integrationType === 'advanced') {
      return ['advanced', 'standard', 'none'];
    }
    if (integrationType === 'standard') {
      return ['standard', 'none'];
    }
    return ['none'];
  }

  private resolveCategory(
    projectTypeToken: string | null,
    text: string,
  ): PricingMatrixContext['category'] {
    if (
      this.matchesAny(
        projectTypeToken,
        ['crm', 'crm_sales', 'sales', 'pipeline', 'cotizaciones'],
      ) ||
      /(crm|pipeline|funnel|cotiz|lead score|seguimiento comercial|ventas)/.test(text)
    ) {
      return 'crm_sales';
    }

    if (
      this.matchesAny(projectTypeToken, ['landing', 'landing_marketing', 'marketing']) ||
      /(landing|campa(?:n|ñ)a|ads|conversion|captaci[oó]n)/.test(text)
    ) {
      return 'landing_marketing';
    }

    if (
      this.matchesAny(projectTypeToken, ['automation', 'automation_ia', 'ia', 'automatizacion']) ||
      /(automatiz|ia|agent|asistente|bot|orquestaci[oó]n)/.test(text)
    ) {
      return 'automation_ia';
    }

    if (
      this.matchesAny(projectTypeToken, ['vertical_saas', 'saas', 'plataforma']) ||
      /(saas|multi-tenant|enterprise|vertical|multi-rol|arquitectura modular)/.test(text)
    ) {
      return 'vertical_saas';
    }

    if (
      this.matchesAny(projectTypeToken, ['web_operativa', 'web', 'ecommerce', 'commerce']) ||
      /(e-?commerce|tienda|pedidos|reservas|blog|sitio web|website)/.test(text)
    ) {
      return 'web_operativa';
    }

    return 'web_operativa';
  }

  private resolveComplexity(text: string): PricingMatrixContext['complexity'] {
    if (
      /(multi-rol|multi modulo|multi-m[oó]dulo|alta escala|legacy|erp|sap|arquitectura|critical|cr[ií]tic)/.test(
        text,
      )
    ) {
      return 'high';
    }

    if (/(dashboard|workflow|pipeline|integraci[oó]n|api|panel|m[oó]dulo|automatiz)/.test(text)) {
      return 'medium';
    }

    return 'low';
  }

  private resolveIntegrationType(text: string): PricingMatrixContext['integrationType'] {
    if (
      /(erp|sap|salesforce|netsuite|oracle|legacy|integraci[oó]n avanzada|m[uú]ltiples? sistemas?)/.test(
        text,
      )
    ) {
      return 'advanced';
    }

    if (
      /(integraci[oó]n|api|webhook|whatsapp|kapso|stripe|hubspot|shopify|wompi|mercadopago|twilio|pasarela)/.test(
        text,
      )
    ) {
      return 'standard';
    }

    return 'none';
  }

  private matchesAny(value: string | null, expectedTokens: string[]): boolean {
    if (!value) {
      return false;
    }

    return expectedTokens.includes(value);
  }

  private normalizePricingToken(value: string | null | undefined): string | null {
    const normalized = value?.trim().toLowerCase();
    return normalized && normalized.length > 0 ? normalized : null;
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
