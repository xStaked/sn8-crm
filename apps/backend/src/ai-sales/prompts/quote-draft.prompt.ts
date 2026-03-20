import type { GenerateQuoteDraftInput, RegenerateQuoteDraftInput } from '../ai-provider.interface';
import { SALES_AGENT_PROMPT_VERSION, SALES_AGENT_SYSTEM_PROMPT } from './sales-agent.system';

export const QUOTE_DRAFT_PROMPT_VERSION = '2026-03-19.quote-v1';

function buildBasePrompt(input: GenerateQuoteDraftInput): string {
  return [
    SALES_AGENT_SYSTEM_PROMPT,
    '',
    `Version de sistema: ${SALES_AGENT_PROMPT_VERSION}`,
    `Version de quote draft: ${QUOTE_DRAFT_PROMPT_VERSION}`,
    '',
    'Tarea:',
    '- Preparar una cotizacion preliminar para revision interna del socio.',
    '- No presentes la cotizacion como final ni comprometida frente al cliente.',
    '- Separa lo que dijo el cliente, lo que el agente infiere y lo que SN8 Labs mostraria al socio para revisar.',
    `- Usa la plantilla version ${input.quoteTemplate.version}.`,
    '',
    'Salida requerida: solo JSON valido con estas llaves exactas:',
    '{',
    '  "summary": string,',
    '  "structuredDraft": {',
    '    "clientStatedNeeds": string[],',
    '    "agentInferences": string[],',
    '    "ownerReviewDraft": {',
    '      "title": string,',
    '      "sections": Array<{ "label": string, "content": string }>,',
    '      "pendingReviewLabel": string',
    '    },',
    '    "discoveryStatus": "ready_for_review" | "needs_more_discovery",',
    '    "missingInformation": string[]',
    '  },',
    '  "renderedQuote": string,',
    '  "ownerReviewNotes": string[],',
    '  "customerSafeStatus": string',
    '}',
    '',
    'Contexto de entrada:',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

export function buildQuoteDraftPrompt(input: GenerateQuoteDraftInput): string {
  return buildBasePrompt(input);
}

export function buildQuoteRegenerationPrompt(
  input: RegenerateQuoteDraftInput,
): string {
  return [
    buildBasePrompt(input),
    '',
    'Instrucciones adicionales de regeneracion:',
    '- Incorpora el feedback del socio sin romper el guardrail de revision interna.',
    '- Si el feedback pide informacion que no existe en el transcript, marcala en missingInformation.',
    '',
    'Feedback del socio:',
    input.ownerFeedback,
    '',
    'Borrador anterior:',
    input.previousDraft,
  ].join('\n');
}
