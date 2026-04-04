import { QuoteEstimatorService } from './quote-estimator.service';

describe('QuoteEstimatorService', () => {
  let service: QuoteEstimatorService;

  beforeEach(() => {
    service = new QuoteEstimatorService();
  });

  it('returns deterministic estimate for same input and rule version', () => {
    const input = {
      conversationId: '+573001112233',
      transcript:
        'Cliente: necesitamos CRM con integracion ERP y WhatsApp. Queremos iniciar este mes.',
      brief: {
        projectType: 'CRM',
        businessProblem: 'Seguimiento comercial manual',
        desiredScope: 'Pipeline, automatizacion y dashboard gerencial',
        budget: 'COP 12,000,000',
        urgency: 'este mes',
        constraints: 'equipo comercial de 4 personas',
        summary: 'Proyecto comercial con integraciones',
      },
      pricingRule: {
        id: 'rule_1',
        version: 4,
        currency: 'COP',
        minMarginPct: 15,
        targetMarginPct: 30,
        maxMarginPct: 45,
        scoreWeights: {
          complexity: 0.4,
          integrations: 0.3,
          urgency: 0.15,
          risk: 0.15,
        },
        confidenceWeights: {
          transcriptQuality: 0.25,
          scopeClarity: 0.4,
          budgetClarity: 0.2,
          urgencyClarity: 0.15,
        },
      },
    };

    const first = service.estimate(input);
    const second = service.estimate(input);

    expect(first).toEqual(second);
    expect(first.ruleVersionUsed).toBe(4);
    expect(first.min).toBeLessThanOrEqual(first.target);
    expect(first.target).toBeLessThanOrEqual(first.max);
    expect(first.assumptions.length).toBeGreaterThan(0);
  });

  it('falls back to default rule metadata when explicit pricing rule is missing', () => {
    const estimate = service.estimate({
      conversationId: '+573004445566',
      transcript: 'Buscamos una automatizacion simple para ventas.',
      brief: {
        projectType: 'automatizacion',
        businessProblem: 'seguimiento manual',
        desiredScope: 'flujo de leads',
        budget: null,
        urgency: null,
        constraints: null,
        summary: null,
      },
      pricingRule: null,
    });

    expect(estimate.currency).toBe('COP');
    expect(estimate.ruleVersionUsed).toBe(1);
    expect(estimate.confidence).toBeGreaterThanOrEqual(35);
    expect(estimate.confidence).toBeLessThanOrEqual(95);
  });
});
