import type { InteractiveButton } from '../../channels/channel.adapter';

export const PHASE_2_GREETING_BUTTONS: InteractiveButton[] = [
  { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
  { id: 'INFO_SERVICES', title: 'Conocer servicios' },
  { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
];

/**
 * Message variants for first contact
 * Natural, varied greetings that don't feel robotic
 */
const FIRST_CONTACT_VARIANTS = [
  'Hola, soy el asistente comercial de SN8 Labs. ¿Qué proyecto tienes en mente? Me cuentas y vemos cómo te podemos ayudar.',
  '¡Hola! Soy de SN8 Labs. Cuéntame sobre tu proyecto — me interesa escuchar qué quieres construir.',
  'Hola, asistente comercial de SN8 Labs aquí. ¿Buscas cotizar algo o quieres conocer primero cómo trabajamos?',
  '¿Qué necesitas construir? Me interesa escuchar tu idea. — Asistente comercial de SN8 Labs',
  'Hola — ¿qué proyecto te trae por aquí? Te ayudo desde SN8 Labs.',
];

/**
 * Message variants for returning contact
 * Acknowledges previous interaction while offering fresh options
 */
const RETURNING_CONTACT_VARIANTS = [
  '¡Hola de nuevo! ¿Seguimos con lo mismo o hay algo nuevo en el radar?',
  '¿Cómo vas? ¿Avanzamos con lo que hablamos o surge algo más?',
  'Bueno verte de nuevo. ¿Continuamos con la cotización anterior o evaluamos algo diferente?',
  '¿Qué tal? ¿Tienes novedades sobre el proyecto que conversamos?',
];

/**
 * Hash a string to a consistent index
 * Provides deterministic but distributed selection
 */
function hashStringToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % max;
}

export function buildGreetingMessage(
  variant: 'first_contact' | 'returning_contact',
  conversationId?: string,
): string {
  if (variant === 'returning_contact') {
    const variants = RETURNING_CONTACT_VARIANTS;
    const index = conversationId 
      ? hashStringToIndex(conversationId, variants.length)
      : 0;
    return variants[index];
  }

  const variants = FIRST_CONTACT_VARIANTS;
  const index = conversationId 
    ? hashStringToIndex(conversationId, variants.length)
    : 0;
  return variants[index];
}

export function buildHumanHandoffCustomerMessage(): string {
  return 'Perfecto. Ya avise a un asesor de nuestro equipo para que continue contigo por este mismo canal en cuanto quede disponible.';
}
