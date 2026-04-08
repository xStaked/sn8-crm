import { PrismaService } from '../prisma/prisma.service';
import { AiSalesService } from './ai-sales.service';
import { QuoteEstimatorService } from './quote-estimator.service';

describe('AiSalesService', () => {
  let prisma: any;
  let provider: any;
  let quoteEstimatorService: QuoteEstimatorService;
  let service: AiSalesService;

  beforeEach(() => {
    prisma = {
      commercialBrief: {
        findUniqueOrThrow: jest.fn(),
      },
      pricingRule: {
        findFirst: jest.fn(),
      },
      quoteDraft: {
        create: jest.fn(),
      },
      quoteEstimateSnapshot: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback(prisma),
      ),
    };

    provider = {
      extractCommercialBrief: jest.fn(),
      generateDiscoveryReply: jest.fn(),
      generateQuoteDraft: jest.fn(),
      regenerateQuoteDraft: jest.fn(),
    };

    quoteEstimatorService = new QuoteEstimatorService();
    service = new AiSalesService(
      provider,
      prisma as unknown as PrismaService,
      quoteEstimatorService,
    );
  });

  it('creates deterministic estimate snapshot when creating a quote draft', async () => {
    prisma.commercialBrief.findUniqueOrThrow.mockResolvedValue({
      id: 'brief_1',
      customerName: 'ACME',
      projectType: 'crm',
      businessProblem: 'seguimiento manual',
      desiredScope: 'pipeline + integracion whatsapp',
      budget: '12000000',
      urgency: 'esta semana',
      constraints: 'equipo comercial pequeno',
      summary: 'brief',
      quoteDrafts: [{ version: 2 }],
    });

    provider.generateQuoteDraft.mockResolvedValue({
      summary: 'Resumen',
      structuredDraft: { ownerReviewDraft: { title: 'Borrador' } },
      renderedQuote: 'Cotizacion',
      ownerReviewNotes: ['Nota'],
      customerSafeStatus: 'Pendiente',
      model: 'deepseek-chat',
    });

    prisma.pricingRule.findFirst
      .mockResolvedValueOnce({
        id: 'rule_4',
        category: 'crm_sales',
        complexity: 'high',
        integrationType: 'advanced',
        version: 4,
        currency: 'COP',
        minMarginPct: 15,
        targetMarginPct: 30,
        maxMarginPct: 45,
        scoreWeights: { complexity: 0.4, integrations: 0.3, urgency: 0.15, risk: 0.15 },
        confidenceWeights: {
          transcriptQuality: 0.25,
          scopeClarity: 0.4,
          budgetClarity: 0.2,
          urgencyClarity: 0.15,
        },
      });

    prisma.quoteDraft.create.mockResolvedValue({
      id: 'draft_3',
      commercialBriefId: 'brief_1',
      conversationId: '+573001112233',
      version: 3,
      reviewStatus: 'pending_owner_review',
    });
    prisma.quoteEstimateSnapshot.create.mockResolvedValue({
      id: 'snapshot_1',
    });

    await service.createQuoteDraftFromTranscript({
      conversationId: '+573001112233',
      transcript: 'Cliente pide CRM con WhatsApp API y ERP',
      commercialBriefId: 'brief_1',
    });

    expect(prisma.quoteDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 3,
          pricingRuleId: 'rule_4',
          pricingRuleVersion: 4,
          draftPayload: expect.objectContaining({
            deterministicEstimate: expect.objectContaining({
              ruleVersionUsed: 4,
            }),
          }),
        }),
      }),
    );
    expect(prisma.quoteEstimateSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: '+573001112233',
          quoteDraftId: 'draft_3',
          estimatedMinAmount: expect.any(Number),
          estimatedTargetAmount: expect.any(Number),
          estimatedMaxAmount: expect.any(Number),
          confidencePct: expect.any(Number),
        }),
      }),
    );
    expect(prisma.pricingRule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'crm_sales',
          complexity: 'high',
          integrationType: 'advanced',
          isActive: true,
          archivedAt: null,
        }),
      }),
    );
  });

  it('falls back inside the matrix when an exact integration match does not exist', async () => {
    prisma.pricingRule.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'rule_fallback',
        category: 'crm_sales',
        complexity: 'medium',
        integrationType: 'standard',
        version: 5,
        currency: 'COP',
        minMarginPct: 25,
        targetMarginPct: 35,
        maxMarginPct: 50,
        scoreWeights: null,
        confidenceWeights: null,
      });

    const resolved = await service.resolveApplicablePricingRule({
      category: 'crm_sales',
      complexity: 'medium',
      integrationType: 'advanced',
    });

    expect(resolved).toMatchObject({
      id: 'rule_fallback',
      category: 'crm_sales',
      complexity: 'medium',
      integrationType: 'standard',
    });
    expect(prisma.pricingRule.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'crm_sales',
          complexity: 'medium',
          integrationType: 'advanced',
        }),
      }),
    );
    expect(prisma.pricingRule.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'crm_sales',
          complexity: 'medium',
          integrationType: 'standard',
        }),
      }),
    );
  });
});
