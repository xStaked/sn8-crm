import {
  buildDiscoveryReplyPrompt,
  DISCOVERY_REPLY_PROMPT_VERSION,
} from './discovery-reply.prompt';
import { SALES_AGENT_PROMPT_VERSION, SALES_AGENT_SYSTEM_PROMPT } from './sales-agent.system';

describe('ai-sales prompts guardrails', () => {
  it('exposes updated prompt versions for traceability', () => {
    expect(DISCOVERY_REPLY_PROMPT_VERSION).toBe('2026-04-08.discovery-v3');
    expect(SALES_AGENT_PROMPT_VERSION).toBe('2026-04-08.system-v2');
  });

  it('includes MVP-first, phased-roadmap and exclusions guidance in system prompt', () => {
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('Proponer MVP como fase 1 por defecto');
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('roadmap por fases');
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain(
      'hosting/infraestructura, consumo IA/LLM, mensajeria',
    );
  });

  it('includes phased roadmap and exclusions instructions in discovery reply prompt', () => {
    const prompt = buildDiscoveryReplyPrompt({
      transcript: 'Cliente: quiero una plataforma completa y no tengo presupuesto cerrado.',
      missingField: 'desiredScope',
      isFirstTouch: false,
      knownProjectType: 'Plataforma CRM',
    });

    expect(prompt).toContain('reconduce a enfoque por fases');
    expect(prompt).toContain('MVP con impacto medible y luego roadmap de expansion');
    expect(prompt).toContain('exclusiones clave: hosting/infraestructura');
  });
});
