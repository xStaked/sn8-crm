import type { ExtractCommercialBriefInput } from '../ai-provider.interface';
import { SALES_AGENT_PROMPT_VERSION, SALES_AGENT_SYSTEM_PROMPT } from './sales-agent.system';

export const BRIEF_EXTRACTION_PROMPT_VERSION = '2026-03-19.brief-v1';

export function buildBriefExtractionPrompt(
  input: ExtractCommercialBriefInput,
): string {
  return [
    SALES_AGENT_SYSTEM_PROMPT,
    '',
    `Version de sistema: ${SALES_AGENT_PROMPT_VERSION}`,
    `Version de brief extraction: ${BRIEF_EXTRACTION_PROMPT_VERSION}`,
    '',
    'Tarea:',
    '- Consolidar un brief comercial estructurado para un proyecto de desarrollo de software a medida.',
    '- Distinguir claramente lo que el cliente dijo de lo que el agente infiere.',
    '- Si faltan datos clave para cotizar, listarlos en missingInformation en vez de inventarlos.',
    '',
    'Salida requerida: solo JSON valido con estas llaves exactas:',
    '{',
    '  "customerName": string | null,',
    '  "projectType": string | null,',
    '  "businessProblem": string | null,',
    '  "desiredScope": string | null,',
    '  "budget": string | null,',
    '  "urgency": string | null,',
    '  "constraints": string | null,',
    '  "summary": string,',
    '  "customerSignals": string[],',
    '  "agentInferences": string[],',
    '  "missingInformation": string[]',
    '}',
    '',
    'Contexto de entrada:',
    JSON.stringify(input, null, 2),
  ].join('\n');
}
