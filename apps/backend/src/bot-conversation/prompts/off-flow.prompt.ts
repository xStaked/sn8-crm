import { BotConversationState } from '../bot-conversation.types';

export const OFF_FLOW_MAX_RETRIES = 3;

export const OFF_FLOW = {
  greeting:
    'Elige una de las opciones principales o cuentame brevemente que necesitas para llevarte por la ruta correcta.',
  infoServices:
    'Si quieres, te explico nuestros servicios o te paso directo a cotizacion para aterrizar tu caso.',
  qualifying:
    'Para seguir con tu cotizacion necesito que me respondas por texto con el detalle de tu proyecto.',
} as const;

type BuildOffFlowMessageInput = {
  state: BotConversationState;
  attempt: number;
  lastUserMessage?: string | null;
  isMedia?: boolean;
};

export function buildOffFlowMessage(input: BuildOffFlowMessageInput): string {
  const acknowledgment = input.isMedia
    ? 'Por ahora solo procesamos mensajes de texto.'
    : buildAcknowledgment(input.lastUserMessage);
  const guidance = buildGuidance(input.state, input.attempt);

  return `${acknowledgment} ${guidance}`.trim();
}

function buildAcknowledgment(message?: string | null): string {
  const cleaned = message?.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Necesito un poco mas de contexto para ayudarte bien.';
  }

  const snippet = cleaned.slice(0, 80);
  return `Tomo nota de "${snippet}".`;
}

function buildGuidance(state: BotConversationState, attempt: number): string {
  const suffix =
    attempt >= OFF_FLOW_MAX_RETRIES - 1
      ? 'Si prefieres, tambien puedo escalar esto con un asesor.'
      : '';

  switch (state) {
    case BotConversationState.INFO_SERVICES:
      return `${OFF_FLOW.infoServices} ${suffix}`.trim();
    case BotConversationState.QUALIFYING:
    case BotConversationState.AI_SALES:
      return `${OFF_FLOW.qualifying} ${suffix}`.trim();
    case BotConversationState.GREETING:
    default:
      return `${OFF_FLOW.greeting} ${suffix}`.trim();
  }
}
