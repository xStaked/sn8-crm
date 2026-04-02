export const DISCOVERY_REPLY_PROMPT_VERSION = '2026-04-01.discovery-v2';

const FIELD_GOAL: Record<string, string> = {
  projectType: 'entender qué tipo de solución quiere construir (ej: CRM, app móvil, ecommerce, automatización, dashboard interno)',
  businessProblem: 'entender cuál es el problema principal que quiere resolver',
  desiredScope: 'entender qué debe incluir la primera versión como mínimo',
  budget: 'entender qué rango de presupuesto maneja',
  urgency: 'entender qué tan urgente es y si tiene fecha objetivo o ventana para arrancar',
  constraints: 'entender si hay restricciones importantes (integraciones, tecnología, equipo, compliance, tiempos)',
};

/**
 * Acknowledgment variants to avoid repetitive "Perfecto"
 */
const ACKNOWLEDGMENT_VARIANTS = [
  'Vale',
  'Entiendo',
  'Claro',
  'Interesante',
  'Suena bien',
  'Tiene sentido',
  'Buenísimo',
  'Ok',
  'Dale',
  'Genial',
  'Perfecto',
  'Entendido',
];

export type DiscoveryReplyInput = {
  transcript: string;
  missingField: string;
  isFirstTouch: boolean;
  knownProjectType?: string | null;
  customerName?: string | null;
  conversationContext?: {
    previousTopics: string[];
    customerTone: 'formal' | 'casual' | 'technical';
    expressedConcerns: string[];
  };
};

export function buildDiscoveryReplyPrompt(input: DiscoveryReplyInput): string {
  const fieldGoal = FIELD_GOAL[input.missingField] ?? `obtener información sobre: ${input.missingField}`;

  const lines = [
    'Eres un asesor comercial senior de SN8 Labs respondiendo por WhatsApp.',
    'Aplicas técnicas de neuroventas: reciprocidad (dar valor primero), autoridad (mostrar expertise), compromiso progresivo (pequeños síes), y empatía.',
    '',
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

  if (input.customerName) {
    lines.push(
      `El cliente se llama ${input.customerName}. Usa su nombre naturalmente en la conversación.`,
      '',
    );
  }

  if (input.knownProjectType) {
    lines.push(
      `Ya mencionó que quiere: ${input.knownProjectType}. Reconoce esto antes de continuar.`,
      '',
    );
  }

  if (input.conversationContext?.previousTopics.length) {
    lines.push(
      'Temas mencionados previamente: ' + input.conversationContext.previousTopics.join(', '),
      'Referencia alguno de estos temas si es natural hacerlo.',
      '',
    );
  }

  if (input.conversationContext?.expressedConcerns.length) {
    lines.push(
      'Preocupaciones expresadas por el cliente: ' + input.conversationContext.expressedConcerns.join(', '),
      'Aborda proactivamente estas preocupaciones de forma suave.',
      '',
    );
  }

  lines.push(
    'Escribe UN SOLO mensaje de WhatsApp que:',
    '- Sea natural y conversacional, como lo escribiría un asesor real por WhatsApp',
    '- Reaccione brevemente a lo que el cliente acaba de decir (ACKNOWLEDGE)',
    '- Agregue valor: comparte un insight breve relacionado al tipo de proyecto si es relevante (RECIPROCIDAD)',
    '- Valide el esfuerzo/progreso del cliente: "Veo que ya tienes claro X" o "Tiene sentido lo que planteas" (COMMITMENT)',
    '- Haga la pregunta de forma directa pero amable',
    '- Use tuteo e informalidad (sin "usted", sin formalidades corporativas)',
    '- Sea conciso: máximo 2-3 oraciones en total',
    '- Varíe el inicio: NO uses siempre "Perfecto,". Alternativas: ' + ACKNOWLEDGMENT_VARIANTS.join(', '),
    '- Adapta tu tono al del cliente: ' + (input.conversationContext?.customerTone ?? 'casual'),
    '- NO prometas precios, alcances ni fechas sin revisión interna',
    '- NO hagas más de una pregunta a la vez',
    '- Si el proyecto es ambicioso, valida la visión antes de pedir detalles',
    '- Maneja objeciones implícitas (presupuesto, tiempo) de forma suave',
    '',
    'Estructura sugerida: [ACK] + [VALUE/VALIDATION] + [QUESTION]',
    '',
    'Ejemplo de buena respuesta:',
    '"Buenísimo, un marketplace de servicios. Lo interesante ahí suele ser el matching en tiempo real. ¿Ya tienes definido si necesitas tracking GPS en vivo o más bien agendamiento?"',
    '',
    'Responde SOLO con JSON válido: { "reply": "..." }',
  );

  return lines.join('\n');
}

/**
 * Build a prompt for extracting conversational context from messages
 * Used to maintain memory of the conversation flow
 */
export function buildConversationContextPrompt(transcript: string): string {
  return [
    'Analiza la siguiente conversación y extrae el contexto conversacional:',
    '',
    '---',
    transcript,
    '---',
    '',
    'Responde SOLO con JSON válido en este formato:',
    '{',
    '  "previousTopics": ["tema1", "tema2"], // Temas mencionados por el cliente',
    '  "customerTone": "formal" | "casual" | "technical", // Tono detectado',
    '  "expressedConcerns": ["preocupacion1"], // Preocupaciones/objeciones expresadas',
    '  "enthusiasmLevel": "low" | "medium" | "high", // Nivel de entusiasmo',
    '  "decisionUrgency": "immediate" | "medium" | "long_term", // Urgencia percibida',
    '  "technicalLevel": "non_technical" | "some" | "expert" // Nivel técnico del cliente',
    '}',
  ].join('\n');
}
