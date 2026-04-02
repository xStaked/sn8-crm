import { BotConversationState } from '../bot-conversation.types';

export const OFF_FLOW_MAX_RETRIES = 3;

/**
 * Types of off-flow deviations that can be detected
 */
export type OffFlowType = 
  | 'early_price_question'
  | 'topic_switch'
  | 'technical_question'
  | 'example_request'
  | 'generic';

/**
 * Contextual responses for early price questions
 * Uses neurosales: acknowledges concern, provides value, redirects
 */
const EARLY_PRICE_RESPONSES = [
  'Entiendo que el presupuesto es clave. Para darte un rango realista, necesito entender primero el alcance. ¿Me cuentas un poco más sobre qué necesitas?',
  'Claro, el precio importa. Depende mucho de los detalles del proyecto. ¿Qué alcance tienes en mente?',
  'Tiene sentido preguntar por el precio. Varía según funcionalidades y complejidad. ¿Me das más contexto del proyecto para orientarte mejor?',
];

/**
 * Contextual responses for topic switches
 */
const TOPIC_SWITCH_RESPONSES = [
  'Me parece bien cambiar de tema. ¿Esto es parte del mismo proyecto o es algo aparte?',
  'Vale, entiendo. ¿Esto complementa lo que hablamos o es un proyecto diferente?',
  'Perfecto, me gusta explorar opciones. ¿Es una alternativa al proyecto anterior o algo adicional?',
];

/**
 * Contextual responses for technical questions
 */
const TECHNICAL_QUESTION_RESPONSES = [
  'Buena pregunta técnica. Depende de varios factores del proyecto. ¿Ya tienes definida la arquitectura o lo vemos juntos?',
  'Interesante punto técnico. La implementación varía según el alcance. ¿Tienes preferencias de stack o lo evaluamos?',
  'Buena observación. Eso se define según requerimientos específicos. ¿Qué tan técnico necesitas que sea el equipo?',
];

/**
 * Contextual responses for example/case study requests
 */
const EXAMPLE_REQUEST_RESPONSES = [
  'Claro, tengo casos similares. Depende del tipo de proyecto que tengas en mente. ¿Me cuentas un poco más sobre el tuyo?',
  'Sí, hemos trabajado en proyectos parecidos. Para mostrarte algo relevante, ¿me das más contexto de lo que necesitas?',
  'Por supuesto. Tenemos experiencia en varios sectores. ¿En qué industria está tu proyecto?',
];

/**
 * Generic off-flow responses by state
 */
const GENERIC_OFF_FLOW: Partial<Record<BotConversationState, string[]>> = {
  [BotConversationState.GREETING]: [
    'Elige una de las opciones principales o cuéntame brevemente qué necesitas para llevarte por la ruta correcta.',
    '¿Prefieres cotizar un proyecto, conocer nuestros servicios, o hablar con alguien del equipo?',
  ],
  [BotConversationState.INFO_SERVICES]: [
    'Si quieres, te explico nuestros servicios o te paso directo a cotización para aterrizar tu caso.',
    '¿Te gustaría que profundice en algún servicio específico o pasamos a cotizar tu proyecto?',
  ],
  [BotConversationState.QUALIFYING]: [
    'Para seguir con tu cotización necesito que me respondas por texto con el detalle de tu proyecto.',
    'Estoy listo para ayudarte a cotizar. ¿Me cuentas más sobre tu proyecto?',
  ],
  [BotConversationState.AI_SALES]: [
    'Para seguir con tu cotización necesito que me respondas por texto con el detalle de tu proyecto.',
    'Estoy listo para ayudarte a cotizar. ¿Me cuentas más sobre tu proyecto?',
  ],
  [BotConversationState.HUMAN_HANDOFF]: [
    'Un asesor humano ya está al tanto de tu conversación. Continuarás con él en cuanto esté disponible.',
    'Te hemos conectado con un asesor. Por favor espera un momento.',
  ],
};

type BuildOffFlowMessageInput = {
  state: BotConversationState;
  attempt: number;
  lastUserMessage?: string | null;
  isMedia?: boolean;
  conversationId?: string;
};

/**
 * Detect the type of off-flow deviation based on user message
 */
export function detectOffFlowType(message?: string | null): OffFlowType {
  if (!message) return 'generic';
  
  const lowerMsg = message.toLowerCase();
  
  // Early price question detection
  if (/\b(cuanto|cuesta|precio|presupuesto|valor|tarifa|cuánto|barato|caro|inversión|invertir)\b/i.test(lowerMsg) &&
      !/\b(ya tengo|definí|es de|son|entre)\b/i.test(lowerMsg)) {
    return 'early_price_question';
  }
  
  // Topic switch detection
  if (/\b(otro|otra|diferente|en cambio|pero también|además|alternativa)\b/i.test(lowerMsg) &&
      /\b(proyecto|cosa|idea|opción|app|sistema)\b/i.test(lowerMsg)) {
    return 'topic_switch';
  }
  
  // Technical question detection
  if (/\b(tecnología|stack|lenguaje|framework|database|api|servidor|hosting|deploy|arquitectura|backend|frontend|mobile)\b/i.test(lowerMsg) &&
      /\b(cuál|qué|cómo|usa|usan|recomiendan|mejor)\b/i.test(lowerMsg)) {
    return 'technical_question';
  }
  
  // Example/case request detection
  if (/\b(ejemplos?|casos?|referencias?|trabajos? anteriores?|clientes?|portafolio|muestras?|demos?)\b/i.test(lowerMsg) &&
      /\b(tienen|han|hicieron|muestran|mostraron|mostrarme|pasaron|similar|parecido)\b/i.test(lowerMsg)) {
    return 'example_request';
  }
  
  return 'generic';
}

/**
 * Hash a string to a consistent index for variant selection
 */
function hashStringToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % max;
}

/**
 * Get a contextual response based on off-flow type
 */
function getContextualResponse(
  type: OffFlowType,
  state: BotConversationState,
  conversationId?: string,
): string {
  let responses: string[];
  
  switch (type) {
    case 'early_price_question':
      responses = EARLY_PRICE_RESPONSES;
      break;
    case 'topic_switch':
      responses = TOPIC_SWITCH_RESPONSES;
      break;
    case 'technical_question':
      responses = TECHNICAL_QUESTION_RESPONSES;
      break;
    case 'example_request':
      responses = EXAMPLE_REQUEST_RESPONSES;
      break;
    case 'generic':
    default:
      responses = GENERIC_OFF_FLOW[state] ?? GENERIC_OFF_FLOW[BotConversationState.GREETING];
  }
  
  // Use conversationId for consistent variant selection
  const index = conversationId 
    ? hashStringToIndex(conversationId, responses.length)
    : 0;
  
  return responses[index];
}

export function buildOffFlowMessage(input: BuildOffFlowMessageInput): string {
  const acknowledgment = input.isMedia
    ? 'Por ahora solo procesamos mensajes de texto.'
    : buildAcknowledgment(input.lastUserMessage);
  
  // Detect off-flow type for contextual guidance
  const offFlowType = detectOffFlowType(input.lastUserMessage);
  const guidance = buildGuidance(offFlowType, input.state, input.attempt, input.conversationId);

  return `${acknowledgment} ${guidance}`.trim();
}

function buildAcknowledgment(message?: string | null): string {
  const cleaned = message?.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Necesito un poco más de contexto para ayudarte bien.';
  }

  const snippet = cleaned.slice(0, 80);
  return `Tomo nota de "${snippet}".`;
}

function buildGuidance(
  offFlowType: OffFlowType,
  state: BotConversationState,
  attempt: number,
  conversationId?: string,
): string {
  const suffix =
    attempt >= OFF_FLOW_MAX_RETRIES - 1
      ? 'Si prefieres, también puedo escalar esto con un asesor.'
      : '';

  // Use contextual response for specific off-flow types
  if (offFlowType !== 'generic') {
    const contextualResponse = getContextualResponse(offFlowType, state, conversationId);
    return `${contextualResponse} ${suffix}`.trim();
  }

  // Fall back to generic state-based guidance
  const responses = GENERIC_OFF_FLOW[state] ?? GENERIC_OFF_FLOW[BotConversationState.GREETING];
  const index = conversationId 
    ? hashStringToIndex(conversationId, responses.length)
    : 0;
  
  return `${responses[index]} ${suffix}`.trim();
}

export { getContextualResponse };
