export const DISCOVERY_REPLY_PROMPT_VERSION = '2026-03-19.discovery-v1';

const FIELD_GOAL: Record<string, string> = {
  projectType: 'entender qué tipo de solución quiere construir (ej: CRM, app móvil, ecommerce, automatización, dashboard interno)',
  businessProblem: 'entender cuál es el problema principal que quiere resolver',
  desiredScope: 'entender qué debe incluir la primera versión como mínimo',
  budget: 'entender qué rango de presupuesto maneja',
  urgency: 'entender qué tan urgente es y si tiene fecha objetivo o ventana para arrancar',
  constraints: 'entender si hay restricciones importantes (integraciones, tecnología, equipo, compliance, tiempos)',
};

export type DiscoveryReplyInput = {
  transcript: string;
  missingField: string;
  isFirstTouch: boolean;
  knownProjectType?: string | null;
};

export function buildDiscoveryReplyPrompt(input: DiscoveryReplyInput): string {
  const fieldGoal = FIELD_GOAL[input.missingField] ?? `obtener información sobre: ${input.missingField}`;

  const lines = [
    'Eres un asesor comercial de SN8 Labs respondiendo por WhatsApp.',
    'Tu objetivo en este mensaje: ' + fieldGoal + '.',
    '',
    'Conversación hasta ahora:',
    '---',
    input.transcript,
    '---',
    '',
  ];

  if (input.isFirstTouch) {
    lines.push(
      'Es el primer contacto con este cliente. Preséntate brevemente como asesor de SN8 Labs al inicio del mensaje.',
      '',
    );
  }

  lines.push(
    'Escribe UN SOLO mensaje de WhatsApp que:',
    '- Sea natural y conversacional, como lo escribiría un asesor real por WhatsApp',
    '- Reaccione brevemente a lo que el cliente acaba de decir si aporta algo',
    '- Haga la pregunta de forma directa y clara, sin rodeos',
    '- Use tuteo e informalidad (sin "usted", sin formalidades corporativas)',
    '- Sea conciso: máximo 2-3 oraciones en total',
    '- Varíe el inicio del mensaje: NO uses siempre "Perfecto," ni "Entendido,"',
    '- NO prometas precios, alcances ni fechas sin revisión interna',
    '- NO hagas más de una pregunta a la vez',
    '',
    'Responde SOLO con JSON válido: { "reply": "..." }',
  );

  return lines.join('\n');
}
