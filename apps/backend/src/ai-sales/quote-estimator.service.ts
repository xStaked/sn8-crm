import { Injectable } from '@nestjs/common';

type BriefLike = {
  projectType?: string | null;
  businessProblem?: string | null;
  desiredScope?: string | null;
  budget?: string | null;
  urgency?: string | null;
  constraints?: string | null;
  summary?: string | null;
};

type PricingRuleLike = {
  id: string;
  version: number;
  currency: string;
  minMarginPct: number;
  targetMarginPct: number;
  maxMarginPct: number;
  scoreWeights: Record<string, number> | null;
  confidenceWeights: Record<string, number> | null;
};

export type DeterministicQuoteEstimate = {
  score: number;
  min: number;
  target: number;
  max: number;
  confidence: number;
  assumptions: string[];
  ruleVersionUsed: number | null;
  currency: string;
  breakdown: {
    baseAmount: number;
    complexityAmount: number;
    integrationsAmount: number;
    urgencyAmount: number;
    riskAmount: number;
    totalAdjustmentAmount: number;
    factors: {
      complexity: number;
      integrations: number;
      urgency: number;
      risk: number;
    };
    scoreWeights: {
      complexity: number;
      integrations: number;
      urgency: number;
      risk: number;
    };
    confidenceSignals: {
      transcriptQuality: number;
      scopeClarity: number;
      budgetClarity: number;
      urgencyClarity: number;
    };
  };
};

type EstimateInput = {
  conversationId: string;
  transcript: string;
  brief: BriefLike;
  pricingRule?: PricingRuleLike | null;
};

@Injectable()
export class QuoteEstimatorService {
  private static readonly FALLBACK_RULE_VERSION = 1;
  private static readonly FALLBACK_CURRENCY = 'COP';
  private static readonly FALLBACK_MARGINS = {
    minMarginPct: 15,
    targetMarginPct: 30,
    maxMarginPct: 45,
  };
  private static readonly DEFAULT_SCORE_WEIGHTS = {
    complexity: 0.35,
    integrations: 0.25,
    urgency: 0.2,
    risk: 0.2,
  };
  private static readonly DEFAULT_CONFIDENCE_WEIGHTS = {
    transcriptQuality: 0.3,
    scopeClarity: 0.35,
    budgetClarity: 0.2,
    urgencyClarity: 0.15,
  };

  estimate(input: EstimateInput): DeterministicQuoteEstimate {
    const baseAmount = this.resolveBaseAmount(input.brief);
    const factors = {
      complexity: this.resolveComplexityFactor(input),
      integrations: this.resolveIntegrationsFactor(input),
      urgency: this.resolveUrgencyFactor(input),
      risk: this.resolveRiskFactor(input),
    };

    const scoreWeights = this.resolveScoreWeights(input.pricingRule?.scoreWeights ?? null);
    const weightedScore = this.clamp(
      factors.complexity * scoreWeights.complexity +
        factors.integrations * scoreWeights.integrations +
        factors.urgency * scoreWeights.urgency +
        factors.risk * scoreWeights.risk,
      0,
      100,
    );

    const complexityAmount = this.roundCurrency(baseAmount * ((factors.complexity / 100) * 0.25));
    const integrationsAmount = this.roundCurrency(
      baseAmount * ((factors.integrations / 100) * 0.2),
    );
    const urgencyAmount = this.roundCurrency(baseAmount * ((factors.urgency / 100) * 0.15));
    const riskAmount = this.roundCurrency(baseAmount * ((factors.risk / 100) * 0.2));
    const totalAdjustmentAmount = this.roundCurrency(
      complexityAmount + integrationsAmount + urgencyAmount + riskAmount,
    );

    const target = this.roundCurrency(baseAmount + totalAdjustmentAmount);
    const margins = this.resolveMargins(input.pricingRule);
    const targetCost = target / (1 + margins.targetMarginPct / 100);
    const min = this.roundCurrency(targetCost * (1 + margins.minMarginPct / 100));
    const max = this.roundCurrency(targetCost * (1 + margins.maxMarginPct / 100));

    const confidenceSignals = this.resolveConfidenceSignals(input, factors);
    const confidenceWeights = this.resolveConfidenceWeights(
      input.pricingRule?.confidenceWeights ?? null,
    );
    const confidence = Math.round(
      this.clamp(
        confidenceSignals.transcriptQuality * confidenceWeights.transcriptQuality +
          confidenceSignals.scopeClarity * confidenceWeights.scopeClarity +
          confidenceSignals.budgetClarity * confidenceWeights.budgetClarity +
          confidenceSignals.urgencyClarity * confidenceWeights.urgencyClarity,
        35,
        95,
      ),
    );

    return {
      score: Number(weightedScore.toFixed(2)),
      min,
      target,
      max,
      confidence,
      assumptions: this.buildAssumptions(input, factors),
      ruleVersionUsed: input.pricingRule?.version ?? QuoteEstimatorService.FALLBACK_RULE_VERSION,
      currency:
        input.pricingRule?.currency?.trim().toUpperCase() ||
        QuoteEstimatorService.FALLBACK_CURRENCY,
      breakdown: {
        baseAmount,
        complexityAmount,
        integrationsAmount,
        urgencyAmount,
        riskAmount,
        totalAdjustmentAmount,
        factors,
        scoreWeights,
        confidenceSignals,
      },
    };
  }

  private resolveBaseAmount(brief: BriefLike): number {
    const budgetHint = this.extractBudgetAmount(brief.budget);
    if (budgetHint && budgetHint > 0) {
      return this.roundCurrency(Math.max(1_500_000, budgetHint * 0.65));
    }

    const projectType = (brief.projectType ?? '').toLowerCase();
    if (projectType.includes('crm')) {
      return 8_000_000;
    }
    if (projectType.includes('ecommerce') || projectType.includes('commerce')) {
      return 10_500_000;
    }
    if (
      projectType.includes('automat') ||
      projectType.includes('ia') ||
      projectType.includes('integr')
    ) {
      return 9_500_000;
    }

    return 7_000_000;
  }

  private resolveComplexityFactor(input: EstimateInput): number {
    const text = [
      input.brief.projectType,
      input.brief.businessProblem,
      input.brief.desiredScope,
      input.brief.constraints,
      input.brief.summary,
      input.transcript,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    let score = 35;
    if (/(multi|multicanal|modul|api|microserv|arquitect|migraci)/.test(text)) {
      score += 25;
    }
    if (/(dashboard|pipeline|workflow|automat|orquest)/.test(text)) {
      score += 15;
    }
    if (/(legacy|complej|alto volumen|escala)/.test(text)) {
      score += 15;
    }

    return this.clamp(score, 10, 95);
  }

  private resolveIntegrationsFactor(input: EstimateInput): number {
    const text = [input.brief.desiredScope, input.brief.constraints, input.transcript]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const integrationMatches =
      text.match(
        /(integraci|erp|sap|hubspot|salesforce|stripe|whatsapp|kapso|api|webhook|shopify)/g,
      ) ?? [];
    const inferredIntegrations = Math.min(integrationMatches.length, 6);

    return this.clamp(20 + inferredIntegrations * 12, 10, 95);
  }

  private resolveUrgencyFactor(input: EstimateInput): number {
    const urgencyText = `${input.brief.urgency ?? ''} ${input.transcript}`.toLowerCase();
    if (/(hoy|esta semana|urgente|asap|inmediat)/.test(urgencyText)) {
      return 90;
    }
    if (/(este mes|2 semanas|quincena|pronto)/.test(urgencyText)) {
      return 70;
    }
    if (/(trimestre|sin prisa|cuando se pueda|largo plazo)/.test(urgencyText)) {
      return 35;
    }

    return 55;
  }

  private resolveRiskFactor(input: EstimateInput): number {
    const constraints = (input.brief.constraints ?? '').toLowerCase();
    const scope = (input.brief.desiredScope ?? '').toLowerCase();
    const transcript = input.transcript.toLowerCase();

    let score = 30;
    if (!scope || scope.length < 25) {
      score += 20;
    }
    if (/(depende|pendiente|sin definir|no sabemos|por confirmar)/.test(transcript)) {
      score += 20;
    }
    if (/(limitado|presupuesto ajustado|sin acceso|riesgo|restric)/.test(constraints)) {
      score += 20;
    }

    return this.clamp(score, 10, 95);
  }

  private resolveConfidenceSignals(
    input: EstimateInput,
    factors: { complexity: number; integrations: number; urgency: number; risk: number },
  ) {
    const transcriptLength = input.transcript.trim().length;
    const transcriptQuality = this.clamp(35 + Math.min(transcriptLength / 80, 45), 35, 90);

    const filledFields = [
      input.brief.projectType,
      input.brief.businessProblem,
      input.brief.desiredScope,
      input.brief.constraints,
      input.brief.summary,
    ].filter((value) => !!value && value.trim().length > 0).length;
    const scopeClarity = this.clamp(30 + filledFields * 12, 30, 90);

    const budgetClarity = this.extractBudgetAmount(input.brief.budget) ? 85 : 45;
    const urgencyClarity = input.brief.urgency?.trim() ? 80 : 50;

    const uncertaintyPenalty = this.clamp((factors.risk - 40) * 0.35, 0, 18);

    return {
      transcriptQuality: this.clamp(transcriptQuality - uncertaintyPenalty, 30, 90),
      scopeClarity: this.clamp(scopeClarity - uncertaintyPenalty, 30, 90),
      budgetClarity: this.clamp(budgetClarity - uncertaintyPenalty, 30, 90),
      urgencyClarity: this.clamp(urgencyClarity - uncertaintyPenalty, 30, 90),
    };
  }

  private resolveMargins(rule?: PricingRuleLike | null) {
    return {
      minMarginPct:
        rule?.minMarginPct ?? QuoteEstimatorService.FALLBACK_MARGINS.minMarginPct,
      targetMarginPct:
        rule?.targetMarginPct ?? QuoteEstimatorService.FALLBACK_MARGINS.targetMarginPct,
      maxMarginPct:
        rule?.maxMarginPct ?? QuoteEstimatorService.FALLBACK_MARGINS.maxMarginPct,
    };
  }

  private resolveScoreWeights(weights: Record<string, number> | null) {
    return this.normalizeWeights(weights, QuoteEstimatorService.DEFAULT_SCORE_WEIGHTS);
  }

  private resolveConfidenceWeights(weights: Record<string, number> | null) {
    return this.normalizeWeights(weights, QuoteEstimatorService.DEFAULT_CONFIDENCE_WEIGHTS);
  }

  private normalizeWeights<T extends Record<string, number>>(
    source: Record<string, number> | null,
    defaults: T,
  ): T {
    const merged = Object.keys(defaults).reduce<Record<string, number>>((acc, key) => {
      const raw = source?.[key];
      acc[key] = Number.isFinite(raw) && raw > 0 ? raw : defaults[key];
      return acc;
    }, {});

    const total = Object.values(merged).reduce((acc, value) => acc + value, 0);
    const normalizedTotal = total > 0 ? total : 1;

    const normalized = Object.keys(merged).reduce<Record<string, number>>((acc, key) => {
      acc[key] = Number((merged[key] / normalizedTotal).toFixed(4));
      return acc;
    }, {});
    return normalized as T;
  }

  private buildAssumptions(
    input: EstimateInput,
    factors: { integrations: number; urgency: number; risk: number },
  ): string[] {
    const assumptions = [
      'La estimacion asume alcance incremental con discovery ya completado.',
      'No incluye costos de licenciamiento de terceros ni infraestructura del cliente.',
    ];

    if (factors.integrations >= 65) {
      assumptions.push(
        'Incluye esfuerzo de integraciones externas con APIs de terceros y pruebas de punta a punta.',
      );
    }

    if (factors.urgency >= 75) {
      assumptions.push(
        'El timeline solicitado es agresivo y puede requerir paralelizacion de frentes.',
      );
    }

    if (factors.risk >= 65 || !this.extractBudgetAmount(input.brief.budget)) {
      assumptions.push(
        'Existe incertidumbre comercial/tecnica; el rango max contempla buffer de riesgo.',
      );
    }

    return assumptions;
  }

  private extractBudgetAmount(budget: string | null | undefined): number | null {
    if (!budget) {
      return null;
    }

    const normalized = budget.replace(/[^\d,.\-]/g, '').replace(/,/g, '');
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private roundCurrency(value: number): number {
    return Number(value.toFixed(2));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
