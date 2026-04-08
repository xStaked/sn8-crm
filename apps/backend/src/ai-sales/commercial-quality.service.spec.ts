import { QuoteEstimatorService } from './quote-estimator.service';
import { buildDiscoveryReplyPrompt } from './prompts/discovery-reply.prompt';
import { SALES_AGENT_SYSTEM_PROMPT } from './prompts/sales-agent.system';

describe('Commercial quality suite (pricing accuracy + sales script compliance)', () => {
  let estimator: QuoteEstimatorService;

  beforeEach(() => {
    estimator = new QuoteEstimatorService();
  });

  it('keeps deterministic pricing outputs for a fixed commercial brief and rule version', () => {
    const input = {
      conversationId: '+573001110000',
      transcript:
        'Necesitamos CRM con pipeline, dashboards y automatizaciones para ventas B2B.',
      brief: {
        projectType: 'CRM',
        businessProblem: 'Perdemos seguimiento de oportunidades en diferentes canales.',
        desiredScope: 'Pipeline comercial, tablero de conversion y automatizaciones.',
        budget: 'COP 18,000,000',
        urgency: 'este mes',
        constraints: 'Integracion con WhatsApp y ERP',
        summary: 'Proyecto CRM para controlar embudo comercial.',
      },
      pricingRule: {
        id: 'rule_crm_medium',
        version: 7,
        currency: 'COP',
        minMarginPct: 18,
        targetMarginPct: 32,
        maxMarginPct: 45,
        scoreWeights: {
          complexity: 0.4,
          integrations: 0.3,
          urgency: 0.15,
          risk: 0.15,
        },
        confidenceWeights: {
          transcriptQuality: 0.25,
          scopeClarity: 0.35,
          budgetClarity: 0.25,
          urgencyClarity: 0.15,
        },
      },
    };

    const first = estimator.estimate(input);
    const second = estimator.estimate(input);

    expect(first).toEqual(second);
    expect(first.ruleVersionUsed).toBe(7);
    expect(first.min).toBeLessThanOrEqual(first.target);
    expect(first.target).toBeLessThanOrEqual(first.max);
    expect(first.confidence).toBeGreaterThanOrEqual(35);
  });

  it('increases estimated target when scope complexity and integrations increase', () => {
    const simple = estimator.estimate({
      conversationId: '+573001220000',
      transcript: 'Necesito un landing basico para captar formularios.',
      brief: {
        projectType: 'landing',
        businessProblem: 'No tengo canal de captacion.',
        desiredScope: 'Landing con formulario.',
        budget: 'COP 4,000,000',
        urgency: 'sin prisa',
        constraints: 'ninguna',
        summary: 'Landing basico.',
      },
      pricingRule: null,
    });
    const complex = estimator.estimate({
      conversationId: '+573001330000',
      transcript:
        'Necesito CRM completo con microservicios, APIs, ERP, HubSpot, Shopify y WhatsApp.',
      brief: {
        projectType: 'Plataforma CRM',
        businessProblem: 'Operamos ventas en canales desconectados.',
        desiredScope:
          'CRM multi-modulo, app movil, automatizaciones y sincronizacion bidireccional.',
        budget: 'COP 35,000,000',
        urgency: 'esta semana',
        constraints: 'Integraciones ERP + HubSpot + Shopify + WhatsApp',
        summary: 'Proyecto de alta complejidad con multiples integraciones.',
      },
      pricingRule: null,
    });

    expect(complex.target).toBeGreaterThan(simple.target);
    expect(complex.breakdown.integrationsAmount).toBeGreaterThan(simple.breakdown.integrationsAmount);
    expect(complex.breakdown.complexityAmount).toBeGreaterThan(simple.breakdown.complexityAmount);
  });

  it('enforces sales script guardrails in system and discovery prompts', () => {
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('Proponer MVP como fase 1 por defecto');
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain(
      'hosting/infraestructura, consumo IA/LLM, mensajeria',
    );

    const discoveryPrompt = buildDiscoveryReplyPrompt({
      transcript:
        'Cliente: quiero plataforma completa, aun no tengo presupuesto y necesito saber cuanto cuesta.',
      missingField: 'desiredScope',
      isFirstTouch: false,
      knownProjectType: 'Plataforma CRM',
    });

    expect(discoveryPrompt).toContain('NO insistas pidiendo un número');
    expect(discoveryPrompt).toContain('MVP con impacto medible y luego roadmap de expansion');
    expect(discoveryPrompt).toContain('exclusiones clave: hosting/infraestructura');
  });
});
