import type { RegenerateQuoteDraftInput } from '../ai-provider.interface';
import {
  QUOTE_DRAFT_PROMPT_VERSION,
  buildQuoteDraftPrompt,
} from './quote-draft.prompt';

export const REVISION_FROM_OWNER_FEEDBACK = '2026-03-19.owner-feedback-v1';

export function buildRevisionFromOwnerFeedbackPrompt(
  input: RegenerateQuoteDraftInput,
): string {
  return [
    buildQuoteDraftPrompt(input),
    '',
    `Version de owner feedback revision: ${REVISION_FROM_OWNER_FEEDBACK}`,
    `Version de quote draft: ${QUOTE_DRAFT_PROMPT_VERSION}`,
    '',
    'Instrucciones adicionales de regeneracion:',
    '- Incorpora el feedback del socio sin romper el guardrail de revision interna.',
    '- Si el feedback pide informacion que no existe en el transcript, marcala en missingInformation.',
    '- Manten visible la diferencia entre lo que el cliente confirmo y lo que sigue siendo supuesto.',
    '',
    'Feedback del socio:',
    input.ownerFeedback,
    '',
    'Borrador anterior:',
    input.previousDraft,
  ].join('\n');
}
