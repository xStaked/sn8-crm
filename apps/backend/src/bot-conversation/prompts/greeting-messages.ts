import type { InteractiveButton } from '../../channels/channel.adapter';

export const PHASE_2_GREETING_BUTTONS: InteractiveButton[] = [
  { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
  { id: 'INFO_SERVICES', title: 'Conocer servicios' },
  { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
];

export function buildGreetingMessage(
  variant: 'first_contact' | 'returning_contact',
): string {
  if (variant === 'returning_contact') {
    return 'Hola de nuevo. Soy el asistente comercial de SN8 Labs. Retomemos donde lo dejamos o dime como prefieres avanzar.';
  }

  return 'Hola, soy el asistente comercial de SN8 Labs. Estoy aqui para ayudarte a cotizar tu proyecto, conocer nuestros servicios o ponerte en contacto con un asesor.';
}

export function buildHumanHandoffCustomerMessage(): string {
  return 'Perfecto. Ya avise a un asesor de nuestro equipo para que continue contigo por este mismo canal en cuanto quede disponible.';
}
